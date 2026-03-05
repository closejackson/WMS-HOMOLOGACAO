import { eq, and, or, desc, sql, like, isNull } from "drizzle-orm";
import { getDb } from "./db";
import { getUniqueCode } from "./utils/uniqueCode";
import {
  pickingOrders,
  pickingOrderItems,
  stageChecks,
  stageCheckItems,
  products,
  inventory,
  
  pickingAllocations,
  labelAssociations,
  tenants,
  warehouseLocations,
  inventoryMovements,
} from "../drizzle/schema";
import { TRPCError } from "@trpc/server";

/**
 * Busca pedido por customerOrderNumber para iniciar conferência
 * Apenas pedidos com status 'completed' podem ser conferidos
 */
export async function getOrderForStage(customerOrderNumber: string, tenantId: number | null) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  const conditions: any[] = [
    eq(pickingOrders.customerOrderNumber, customerOrderNumber),
    sql`${pickingOrders.status} = 'picked'`,
  ];

  if (tenantId !== null) {
    conditions.push(eq(pickingOrders.tenantId, tenantId));
  }

  const orders = await dbConn
    .select({
      order: pickingOrders,
      tenantName: tenants.name,
    })
    .from(pickingOrders)
    .leftJoin(tenants, eq(pickingOrders.tenantId, tenants.id))
    .where(and(...conditions))
    .limit(1);

  if (orders.length === 0) {
    // Verificar se pedido existe com outro status para dar feedback específico
    const existingOrderConditions: any[] = [
      eq(pickingOrders.customerOrderNumber, customerOrderNumber),
    ];
    
    if (tenantId !== null) {
      existingOrderConditions.push(eq(pickingOrders.tenantId, tenantId));
    }
    
    const [existingOrder] = await dbConn
      .select({ status: pickingOrders.status })
      .from(pickingOrders)
      .where(and(...existingOrderConditions))
      .limit(1);
      
    if (existingOrder) {
      const statusMessages: Record<string, string> = {
        pending: 'ainda não foi confirmado para separação. Aguardando confirmação no módulo de Separação',
        completed: 'está pronto para picking. Acesse o módulo de Separação para realizar o picking',
        picked: 'já foi separado e está aguardando conferência no Stage',
        staged: 'já foi conferido no Stage e está aguardando expedição. Acesse o módulo de Expedição',
        shipped: 'já foi expedido e não pode ser conferido novamente',
      };
      
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Pedido ${customerOrderNumber} ${statusMessages[existingOrder.status] || 'não está disponível para conferência'}`,
      });
    }
    
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Pedido ${customerOrderNumber} não encontrado`,
    });
  }

  const { order, tenantName } = orders[0];

  // Buscar itens do pedido
  const items = await dbConn
    .select({
      id: pickingOrderItems.id,
      productId: pickingOrderItems.productId,
      productSku: products.sku,
      productDescription: products.description,
      quantity: pickingOrderItems.requestedQuantity,
      unit: pickingOrderItems.requestedUM,
    })
    .from(pickingOrderItems)
    .leftJoin(products, eq(pickingOrderItems.productId, products.id))
    .where(eq(pickingOrderItems.pickingOrderId, order.id));

  return {
    order,
    items,
    tenantName: tenantName || "N/A",
  };
}

/**
 * Inicia conferência de Stage para um pedido
 * Cria registro de stageCheck e retorna itens (sem quantidades esperadas para conferência cega)
 */
export async function startStageCheck(params: {
  pickingOrderId: number;
  customerOrderNumber: string;
  operatorId: number;
  operatorName: string;
  tenantId: number | null;
}) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  // Buscar pedido para obter tenantId
  const order = await dbConn
    .select()
    .from(pickingOrders)
    .where(eq(pickingOrders.id, params.pickingOrderId))
    .limit(1);

  if (order.length === 0) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Pedido não encontrado",
    });
  }

  const orderTenantId = order[0].tenantId;

  // Verificar se já existe conferência ativa para este pedido
  const existingChecks = await dbConn
    .select()
    .from(stageChecks)
    .where(
      and(
        eq(stageChecks.pickingOrderId, params.pickingOrderId),
        eq(stageChecks.status, "in_progress")
      )
    )
    .limit(1);

  if (existingChecks.length > 0) {
    const existing = existingChecks[0];
    const LOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos
    const now = new Date();
    const lastActivity = existing.lastActivityAt ?? existing.startedAt;
    const isExpired = (now.getTime() - lastActivity.getTime()) >= LOCK_TIMEOUT_MS;
    const isGlobalAdmin = params.tenantId === null; // null = Global Admin
    const isSameUser = existing.lockedByUserId === params.operatorId;
    const isSameTenant = existing.tenantId === orderTenantId;

    // Global Admin pode sempre assumir; mesmo usuário retoma; timeout libera para mesmo tenant
    const canAssume = isGlobalAdmin || isSameUser || (isExpired && isSameTenant);

    if (!canAssume) {
      // Pedido travado por outro usuário ativo no mesmo tenant
      const lockedBy = existing.lockedByName || `Usuário #${existing.lockedByUserId}`;
      const minutesAgo = Math.floor((now.getTime() - lastActivity.getTime()) / 60000);
      throw new TRPCError({
        code: "CONFLICT",
        message: `Este pedido está sendo conferido por ${lockedBy} (há ${minutesAgo} min). Aguarde ou peça ao administrador para liberar.`,
        cause: { lockedByName: lockedBy, lockedByUserId: existing.lockedByUserId, minutesAgo },
      });
    }

    // Assumir o lock (retomar ou forçar liberação)
    await dbConn.update(stageChecks)
      .set({
        lockedByUserId: params.operatorId,
        lockedByName: params.operatorName,
        lastActivityAt: now,
        operatorId: params.operatorId,
      })
      .where(eq(stageChecks.id, existing.id));

    return {
      stageCheckId: existing.id,
      customerOrderNumber: existing.customerOrderNumber,
      message: isSameUser
        ? "Conferência retomada. Continue bipando os produtos."
        : isExpired
          ? "Sessão anterior expirada. Conferência assumida."
          : "Conferência liberada pelo administrador. Iniciando.",
      resumed: true,
    };
  }

  // Criar registro de conferência usando tenantId do pedido
  const now = new Date();
  const [stageCheck] = await dbConn.insert(stageChecks).values({
    tenantId: orderTenantId,
    pickingOrderId: params.pickingOrderId,
    customerOrderNumber: params.customerOrderNumber,
    operatorId: params.operatorId,
    status: "in_progress",
    hasDivergence: false,
    lockedByUserId: params.operatorId,
    lockedByName: params.operatorName,
    lastActivityAt: now,
  });

  // Buscar itens do pedido para criar registros de conferência
  // CORREÇÃO: Incluir batch e expiryDate para agrupar corretamente por SKU+lote
  const orderItems = await dbConn
    .select({
      productId: pickingOrderItems.productId,
      productSku: products.sku,
      productDescription: products.description,
      quantity: pickingOrderItems.requestedQuantity,
      unit: pickingOrderItems.requestedUM,
      unitsPerBox: products.unitsPerBox,
      batch: pickingOrderItems.batch, // ✅ Incluir lote
      expiryDate: pickingOrderItems.expiryDate, // ✅ Incluir validade
    })
    .from(pickingOrderItems)
    .leftJoin(products, eq(pickingOrderItems.productId, products.id))
    .where(eq(pickingOrderItems.pickingOrderId, params.pickingOrderId));

  // CORREÇÃO: Agrupar itens por produto+lote (SKU+batch) ao invés de apenas produto
  // Itens com mesmo SKU mas lotes diferentes devem ser conferidos separadamente

  
  const groupedItems = orderItems.reduce((acc, item) => {
    // Normalizar quantidade para unidades
    let quantityInUnits = item.quantity;
    if (item.unit === 'box' && item.unitsPerBox) {
      quantityInUnits = item.quantity * item.unitsPerBox;

    }
    
    // ✅ Buscar por productId + batch (ao invés de apenas productId)
    const existing = acc.find(i => 
      i.productId === item.productId && 
      i.batch === item.batch
    );
    
    if (existing) {
      existing.quantity += quantityInUnits;
    } else {
      acc.push({
        productId: item.productId!,
        productSku: item.productSku!,
        productDescription: item.productDescription!,
        batch: item.batch || null, // ✅ Incluir lote
        expiryDate: item.expiryDate || null, // ✅ Incluir validade
        quantity: quantityInUnits,
      });
    }
    return acc;
  }, [] as Array<{ 
    productId: number; 
    productSku: string; 
    productDescription: string; 
    batch: string | null; 
    expiryDate: Date | null; 
    quantity: number 
  }>);



  // Criar registros de itens esperados (para comparação posterior)
  for (const item of groupedItems) {
    await dbConn.insert(stageCheckItems).values({
      stageCheckId: Number(stageCheck.insertId),
      productId: item.productId,
      productSku: item.productSku,
      productName: item.productDescription,
      batch: item.batch ?? null, // ✅ Persistir lote para validação posterior
      uniqueCode: getUniqueCode(item.productSku, item.batch || ""), // ✅ Adicionar uniqueCode
      expectedQuantity: item.quantity,
      checkedQuantity: 0,
      divergence: 0,
    });
  }

  return {
    stageCheckId: stageCheck.insertId,
    customerOrderNumber: params.customerOrderNumber,
    message: "Conferência iniciada. Bipe os produtos e informe as quantidades.",
  };
}

/**
 * Registra item conferido (produto bipado + quantidade informada)
 * Atualiza quantidade conferida do item
 * Busca produto pela etiqueta de lote (labelCode) gerada no recebimento
 */
export async function recordStageItem(params: {
  stageCheckId: number;
  labelCode: string;
  quantity?: number; // Opcional quando autoIncrement = true
  autoIncrement?: boolean; // Se true, incrementa automaticamente +1 caixa
  tenantId: number | null; // tenant do usuário logado (null = Global Admin)
}) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  // Buscar o stageCheck para obter o tenantId do PEDIDO (não do usuário)
  // Isso é necessário para Global Admin que tem tenantId=null mas confere pedidos de outros tenants
  const stageCheckResult = await dbConn
    .select({ tenantId: stageChecks.tenantId })
    .from(stageChecks)
    .where(eq(stageChecks.id, params.stageCheckId))
    .limit(1);

  if (stageCheckResult.length === 0) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Conferência #${params.stageCheckId} não encontrada`,
    });
  }

  // tenantId efetivo para validação: usa o tenant do pedido (stageCheck)
  // Se o usuário é Global Admin (params.tenantId === null), ainda valida pelo tenant do pedido
  const orderTenantId = stageCheckResult[0].tenantId;

  // Buscar produto pela etiqueta de lote (labelAssociations)
  const labelResult = await dbConn
    .select({
      productId: labelAssociations.productId,
      batch: labelAssociations.batch,
      expiryDate: labelAssociations.expiryDate,
    })
    .from(labelAssociations)
    .where(eq(labelAssociations.labelCode, params.labelCode))
    .limit(1);

  const label = labelResult[0];

  if (!label) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Etiqueta ${params.labelCode} não encontrada. Verifique se o produto foi recebido corretamente.`,
    });
  }

  // Buscar dados do produto
  const productsResult = await dbConn
    .select()
    .from(products)
    .where(eq(products.id, label.productId))
    .limit(1);

  const product = productsResult[0];

  if (!product) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Produto associado à etiqueta ${params.labelCode} não encontrado`,
    });
  }

  // Validar que o produto pertence ao tenant DO PEDIDO (não do usuário logado)
  // Global Admin (params.tenantId === null) ainda valida pelo tenant do pedido
  if (product.tenantId !== orderTenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Produto não pertence ao tenant do pedido`,
    });
  }

  // Lote identificado na etiqueta bipada
  const scannedBatch = label.batch ?? null;

  // ── BUSCA DO ITEM DE CONFERÊNCIA (com suporte a múltiplos lotes) ──────────
  // CORREÇÃO BUG: A lógica anterior usava limit(1) ao buscar em pickingOrderItems,
  // o que retornava o lote errado quando o mesmo produto tinha múltiplos lotes no pedido.
  // Agora o lote é persistido no stageCheckItem (campo batch) e a busca é precisa.
  let items;

  if (scannedBatch) {
    // Buscar item com lote correspondente ao bipado
    items = await dbConn
      .select()
      .from(stageCheckItems)
      .where(
        and(
          eq(stageCheckItems.stageCheckId, params.stageCheckId),
          eq(stageCheckItems.productId, product.id),
          eq(stageCheckItems.batch, scannedBatch)
        )
      )
      .limit(1);

    // Fallback: mesmo produto mas sem lote cadastrado (aceita qualquer lote)
    if (items.length === 0) {
      items = await dbConn
        .select()
        .from(stageCheckItems)
        .where(
          and(
            eq(stageCheckItems.stageCheckId, params.stageCheckId),
            eq(stageCheckItems.productId, product.id),
            sql`${stageCheckItems.batch} IS NULL`
          )
        )
        .limit(1);
    }
  } else {
    // Etiqueta sem lote: buscar primeiro item do produto sem filtrar lote
    items = await dbConn
      .select()
      .from(stageCheckItems)
      .where(
        and(
          eq(stageCheckItems.stageCheckId, params.stageCheckId),
          eq(stageCheckItems.productId, product.id)
        )
      )
      .limit(1);
  }

  const item = items[0];

  if (!item) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Produto ${product.sku} (etiqueta: ${params.labelCode}) não faz parte deste pedido`,
    });
  }

  // ── VALIDAÇÃO DE LOTE ─────────────────────────────────────────────────────
  // Regras segundo a spec:
  //   • item.batch == null  → item sem lote cadastrado → prossegue sem validação
  //   • item.batch != null e scannedBatch == null → etiqueta sem lote onde lote é esperado → ERRO
  //   • item.batch != null e scannedBatch != item.batch → lote divergente → ERRO
  //   • item.batch != null e scannedBatch == item.batch → OK
  if (item.batch !== null && item.batch !== undefined && item.batch !== "") {
    if (!scannedBatch) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Lote não identificado na etiqueta. Esperado: ${item.batch}. Bipe a etiqueta correta.`,
      });
    }
    if (scannedBatch !== item.batch) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Lote incorreto. Esperado: ${item.batch} — Lido: ${scannedBatch}. Bipe a etiqueta correta.`,
      });
    }
  }
  // ── FIM DA VALIDAÇÃO DE LOTE ─────────────────────────────────────────────

  // Determinar quantidade a incrementar
  let quantityToAdd = params.quantity || 0;
  let isFractional = false;

  if (params.autoIncrement) {
    // Verificar se item é fracionado (quantidade esperada < 1 caixa)
    const unitsPerBox = product.unitsPerBox || 1;
    const remainingQuantity = item.expectedQuantity - item.checkedQuantity;
    
    if (remainingQuantity < unitsPerBox) {
      // Item fracionado: retornar flag para frontend solicitar entrada manual
      isFractional = true;
      return {
        isFractional: true,
        productSku: product.sku,
        productName: product.description,
        labelCode: params.labelCode,
        batch: label.batch,
        remainingQuantity,
        unitsPerBox,
        message: `Item fracionado detectado. Quantidade restante: ${remainingQuantity} unidades (< 1 caixa de ${unitsPerBox} unidades)`,
      };
    }
    
    // Item inteiro: incrementar automaticamente 1 caixa
    quantityToAdd = unitsPerBox;
  }

  if (quantityToAdd <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Quantidade inválida",
    });
  }

  // Atualizar quantidade conferida
  const newCheckedQuantity = item.checkedQuantity + quantityToAdd;
  const newDivergence = newCheckedQuantity - item.expectedQuantity;

  await dbConn
    .update(stageCheckItems)
    .set({
      checkedQuantity: newCheckedQuantity,
      divergence: newDivergence,
    })
    .where(eq(stageCheckItems.id, item.id));

  return {
    isFractional: false,
    stageCheckItemId: item.id, // ID para pilha LIFO de undo
    productSku: product.sku,
    labelCode: params.labelCode,
    batch: label.batch,
    productName: product.description,
    checkedQuantity: newCheckedQuantity,
    quantityAdded: quantityToAdd,
    remainingQuantity: item.expectedQuantity - newCheckedQuantity,
    unitsPerBox: product.unitsPerBox || 1,
    message: `Quantidade registrada: ${quantityToAdd}. Total conferido: ${newCheckedQuantity}/${item.expectedQuantity}`,
  };
}

/**
 * Finaliza conferência de Stage
 * Valida divergências, baixa estoque e atualiza status do pedido
 */
export async function completeStageCheck(params: {
  stageCheckId: number;
  notes?: string;
  force?: boolean;
  tenantId: number | null;
}) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  // Buscar conferência
  const [stageCheck] = await dbConn
    .select()
    .from(stageChecks)
    .where(eq(stageChecks.id, params.stageCheckId))
    .limit(1);

  if (!stageCheck) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Conferência não encontrada",
    });
  }

  if (stageCheck.status !== "in_progress") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Conferência já foi finalizada",
    });
  }

  // Buscar itens conferidos
  const items = await dbConn
    .select()
    .from(stageCheckItems)
    .where(eq(stageCheckItems.stageCheckId, params.stageCheckId));

  // Verificar divergências
  
  // Verificar se há itens não conferidos (checkedQuantity = 0)
  const uncheckedItems = items.filter(item => item.checkedQuantity === 0);
  
  if (uncheckedItems.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Conferência incompleta: ${uncheckedItems.length} item(ns) não foram conferidos`,
      cause: {
        uncheckedItems: uncheckedItems.map(item => ({
          productSku: item.productSku,
          productName: item.productName,
          expectedQuantity: item.expectedQuantity,
        })),
      },
    });
  }
  
  // Verificar divergências reais (quantidade conferida diferente da esperada)
  const hasDivergence = items.some(item => item.divergence !== 0);
  const divergentItems = items.filter(item => item.divergence !== 0);
  
  

  if (hasDivergence && !params.force) {
    // Atualizar status para divergent
    await dbConn
      .update(stageChecks)
      .set({
        status: "divergent",
        hasDivergence: true,
        completedAt: new Date(),
        notes: params.notes,
      })
      .where(eq(stageChecks.id, params.stageCheckId));

    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Divergências encontradas em ${divergentItems.length} item(ns)`,
      cause: {
        divergentItems: divergentItems.map(item => ({
          productSku: item.productSku,
          productName: item.productName,
          expected: item.expectedQuantity,
          checked: item.checkedQuantity,
          divergence: item.divergence,
        })),
      },
    });
  }

  // Buscar pedido de picking para obter tenantId
  const [pickingOrder] = await dbConn
    .select()
    .from(pickingOrders)
    .where(eq(pickingOrders.id, stageCheck.pickingOrderId))
    .limit(1);

  if (!pickingOrder) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Pedido de picking não encontrado",
    });
  }

  // Buscar endereço de expedição do cliente
  const [tenant] = await dbConn
    .select({ shippingAddress: tenants.shippingAddress })
    .from(tenants)
    .where(eq(tenants.id, pickingOrder.tenantId))
    .limit(1);

  let shippingLocation;

  // Se cliente não tem shippingAddress configurado, buscar automaticamente endereço EXP disponível
  if (!tenant || !tenant.shippingAddress) {
    const [autoShippingLocation] = await dbConn
      .select()
      .from(warehouseLocations)
      .where(
        and(
          like(warehouseLocations.code, 'EXP%'),
          eq(warehouseLocations.tenantId, pickingOrder.tenantId),
          or(
            eq(warehouseLocations.status, 'available'),
            eq(warehouseLocations.status, 'available')
          )
        )
      )
      .limit(1);

    if (!autoShippingLocation) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Nenhum endereço de expedição disponível encontrado para este cliente",
      });
    }

    shippingLocation = autoShippingLocation;
  } else {
    // Buscar endereço de expedição configurado no sistema
    const [configuredLocation] = await dbConn
      .select()
      .from(warehouseLocations)
      .where(
        and(
          eq(warehouseLocations.code, tenant.shippingAddress),
          eq(warehouseLocations.tenantId, pickingOrder.tenantId)
        )
      )
      .limit(1);

    if (!configuredLocation) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Endereço de expedição ${tenant.shippingAddress} não encontrado no sistema`,
      });
    }

    shippingLocation = configuredLocation;
  }

  // Movimentar para expedição (EXP)
  // Para cada item, movimentar quantidade conferida das reservas para endereço de expedição
  for (const item of items) {
    // Buscar alocações do produto+lote para este pedido
    const allocationConditions = [
      eq(pickingAllocations.pickingOrderId, stageCheck.pickingOrderId),
      eq(pickingAllocations.productId, item.productId),
    ];
    
    // ✅ FILTRAR POR LOTE se o item tiver batch
    if (item.batch) {
      allocationConditions.push(eq(pickingAllocations.batch, item.batch));
    }
    
    const reservations = await dbConn
      .select({
        id: pickingAllocations.id,
        inventoryId: sql<number>`NULL`.as('inventoryId'), // Não mais usado
        quantity: pickingAllocations.quantity,
        locationId: pickingAllocations.locationId,
        batch: pickingAllocations.batch,
      })
      .from(pickingAllocations)
      .where(and(...allocationConditions));

    let remainingToShip = item.checkedQuantity;

    for (const reservation of reservations) {
      if (remainingToShip <= 0) break;

      const quantityToShip = Math.min(remainingToShip, reservation.quantity);

      // Buscar estoque origem usando productId + locationId + batch
      const inventoryConditions = [
        eq(inventory.productId, item.productId),
        eq(inventory.locationId, reservation.locationId),
      ];
      
      if (reservation.batch) {
        inventoryConditions.push(eq(inventory.batch, reservation.batch));
      } else {
        inventoryConditions.push(isNull(inventory.batch));
      }
      
      const [sourceInventory] = await dbConn
        .select({
          id: inventory.id,
          locationId: inventory.locationId,
          productId: inventory.productId,
          productSku: products.sku,
          batch: inventory.batch,
          expiryDate: inventory.expiryDate,
          quantity: inventory.quantity,
          tenantId: inventory.tenantId,
          status: inventory.status,
        })
        .from(inventory)
        .leftJoin(products, eq(inventory.productId, products.id))
        .where(and(...inventoryConditions))
        .limit(1);

      if (!sourceInventory) {
        console.error(`[STAGE] Estoque não encontrado para produto ${item.productSku}, lote ${reservation.batch}, endereço ${reservation.locationId}`);
        continue;
      }

      // Validar se há estoque suficiente
      if (sourceInventory.quantity < quantityToShip) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Estoque insuficiente no endereço ${sourceInventory.locationId} para o produto ${item.productSku}. Disponível: ${sourceInventory.quantity}, Necessário: ${quantityToShip}. Isso indica inconsistência entre reservas e estoque real.`,
        });
      }

      // Subtrair do estoque origem E zerar reserva
      const newQuantityInStorage = sourceInventory.quantity - quantityToShip;
      await dbConn
        .update(inventory)
        .set({
          quantity: newQuantityInStorage,
          reservedQuantity: 0, // ✅ Zerar reserva após mover para EXP
          status: newQuantityInStorage === 0 ? "available" : sourceInventory.status, // ✅ Se esvaziou, volta para available
        })
        .where(eq(inventory.id, sourceInventory.id)); // ✅ Usar sourceInventory.id ao invés de reservation.inventoryId

      // ✅ ATUALIZAR STATUS DO ENDEREÇO SE FICOU VAZIO
      if (newQuantityInStorage === 0) {
        // Verificar se não há outros produtos neste endereço
        const [otherProducts] = await dbConn
          .select({ count: sql<number>`count(*)` })
          .from(inventory)
          .where(
            and(
              eq(inventory.locationId, sourceInventory.locationId),
              sql`${inventory.quantity} > 0`,
              sql`${inventory.id} != ${sourceInventory.id}`
            )
          );

        // Se não há outros produtos, mudar status para "available"
        if (otherProducts && otherProducts.count === 0) {
          await dbConn
            .update(warehouseLocations)
            .set({
              status: "available",
            })
            .where(eq(warehouseLocations.id, sourceInventory.locationId));
        }
      }

      // Verificar se já existe estoque no endereço de expedição para este produto/lote
      const conditions = [
        eq(inventory.locationId, shippingLocation.id),
        eq(inventory.productId, sourceInventory.productId),
        eq(inventory.tenantId, pickingOrder.tenantId),
      ];
      
      if (sourceInventory.batch) {
        conditions.push(eq(inventory.batch, sourceInventory.batch));
      }

      const [existingShippingInventory] = await dbConn
        .select()
        .from(inventory)
        .where(and(...conditions))
        .limit(1);

      if (existingShippingInventory) {
        // Adicionar ao estoque existente
        await dbConn
          .update(inventory)
          .set({
            quantity: existingShippingInventory.quantity + quantityToShip,
          })
          .where(eq(inventory.id, existingShippingInventory.id));
      } else {
        // ✅ VALIDAÇÃO: Verificar se endereço EXP pode receber este lote
        const { validateLocationForBatch } = await import("./locationValidation");
        const validation = await validateLocationForBatch(
          shippingLocation.id,
          sourceInventory.productId,
          sourceInventory.batch
        );

        if (!validation.allowed) {
          throw new Error(`Erro ao movimentar para expedição: ${validation.reason}`);
        }

        // Criar novo registro de estoque no endereço de expedição
        await dbConn.insert(inventory).values({
          locationId: shippingLocation.id,
          productId: sourceInventory.productId,
          batch: sourceInventory.batch,
          expiryDate: sourceInventory.expiryDate,
          quantity: quantityToShip,
          tenantId: pickingOrder.tenantId,
          status: "available",
          uniqueCode: getUniqueCode(sourceInventory.productSku || "", sourceInventory.batch || ""), // ✅ Adicionar uniqueCode
          locationZone: "EXP", // ✅ Adicionar locationZone (sempre EXP neste ponto)
        });
      }

      // Registrar movimentação
      await dbConn.insert(inventoryMovements).values({
        tenantId: pickingOrder.tenantId,
        productId: sourceInventory.productId,
        batch: sourceInventory.batch,
        uniqueCode: getUniqueCode(sourceInventory.productSku || "", sourceInventory.batch || ""), // ✅ Adicionar uniqueCode
        serialNumber: null, // ✅ Adicionar explicitamente para evitar deslocamento
        fromLocationId: sourceInventory.locationId,
        toLocationId: shippingLocation.id,
        quantity: quantityToShip,
        movementType: "picking",
        referenceType: "picking_order",
        referenceId: stageCheck.pickingOrderId,
        performedBy: stageCheck.operatorId,
        notes: `Movimentação automática após conferência Stage - Pedido ${pickingOrder.customerOrderNumber}`,
      });

      // Alocação já foi processada (não precisa deletar)

      remainingToShip -= quantityToShip;
    }
  }

  // Atualizar status da conferência
  await dbConn
    .update(stageChecks)
    .set({
      status: "completed",
      completedAt: new Date(),
      notes: params.notes,
    })
    .where(eq(stageChecks.id, params.stageCheckId));

  // Atualizar status do pedido para 'staged' (pronto para expedição)
  await dbConn
    .update(pickingOrders)
    .set({
      status: "staged",
    })
    .where(eq(pickingOrders.id, stageCheck.pickingOrderId));

  return {
    message: `Conferência finalizada com sucesso. Produtos movimentados para ${shippingLocation.code}.`,
    stageCheckId: params.stageCheckId,
    customerOrderNumber: stageCheck.customerOrderNumber,
    shippingAddress: shippingLocation.code,
  };
}

/**
 * Busca conferência ativa (in_progress) do operador
 */
export async function getActiveStageCheck(operatorId: number, tenantId: number | null) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  const conditions = [
    eq(stageChecks.operatorId, operatorId),
    eq(stageChecks.status, "in_progress"),
  ];

  if (tenantId !== null) {
    conditions.push(eq(stageChecks.tenantId, tenantId));
  }

  const activeChecks = await dbConn
    .select()
    .from(stageChecks)
    .where(and(...conditions))
    .limit(1);

  const activeCheck = activeChecks[0];

  if (!activeCheck) {
    return null;
  }

  // Buscar itens conferidos
  const items = await dbConn
    .select()
    .from(stageCheckItems)
    .where(eq(stageCheckItems.stageCheckId, activeCheck.id));

  return {
    ...activeCheck,
    items,
  };
}

/**
 * Lista histórico de conferências de Stage
 */
export async function getStageCheckHistory(params: {
  tenantId: number | null;
  limit: number;
  offset: number;
}) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  const conditions = [];

  if (params.tenantId !== null) {
    conditions.push(eq(stageChecks.tenantId, params.tenantId));
  }

  const checks = await dbConn
    .select()
    .from(stageChecks)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(stageChecks.createdAt))
    .limit(params.limit)
    .offset(params.offset);

  return checks;
}

/**
 * Cancela conferência de Stage em andamento
 * Deleta registros de stageCheck e stageCheckItems
 */
export async function cancelStageCheck(params: {
  stageCheckId: number;
  tenantId: number | null;
}) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  // Buscar conferência
  const [stageCheck] = await dbConn
    .select()
    .from(stageChecks)
    .where(eq(stageChecks.id, params.stageCheckId))
    .limit(1);

  if (!stageCheck) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Conferência não encontrada",
    });
  }

  // Validar tenantId
  if (params.tenantId !== null && stageCheck.tenantId !== params.tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Você não tem permissão para cancelar esta conferência",
    });
  }

  if (stageCheck.status !== "in_progress") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Apenas conferências em andamento podem ser canceladas",
    });
  }

  // Deletar itens da conferência
  await dbConn
    .delete(stageCheckItems)
    .where(eq(stageCheckItems.stageCheckId, params.stageCheckId));

  // Deletar conferência
  await dbConn
    .delete(stageChecks)
    .where(eq(stageChecks.id, params.stageCheckId));

  return {
    success: true,
    message: `Conferência do pedido ${stageCheck.customerOrderNumber} cancelada com sucesso`,
  };
}
