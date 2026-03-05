import { eq, and, sum, desc, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  inventory,
  inventoryMovements,
  warehouseLocations,
  warehouseZones,
  products,
  systemUsers,
  receivingPreallocations,
  
  pickingAllocations,
} from "../drizzle/schema";

export interface RegisterMovementInput {
  productId: number;
  fromLocationId: number;
  toLocationId?: number; // Opcional para descarte
  quantity: number;
  batch?: string;
  movementType: "transfer" | "adjustment" | "return" | "disposal" | "quality";
  notes?: string;
  tenantId?: number | null;
  performedBy: number;
  /**
   * Quando true, indica que um admin autenticou a liberação de itens
   * com status blocked ou quarantine. Obrigatório para mover esses itens.
   */
  adminReleaseAuthorized?: boolean;
}

/**
 * Registra movimentação de estoque com validações
 * @param input - Dados da movimentação
 * @param externalTx - Transação externa opcional (para composição atômica)
 */
export async function registerMovement(
  input: RegisterMovementInput,
  externalTx?: any
) {
  const dbConn = externalTx || (await getDb());
  if (!dbConn) throw new Error("Database connection failed");

  // Se não há transação externa, criar uma nova para garantir atomicidade
  if (!externalTx) {
    return await dbConn.transaction(async (tx: any) => {
      return await registerMovementInternal(input, tx);
    });
  }

  // Se há transação externa, executar diretamente
  return await registerMovementInternal(input, dbConn);
}

/**
 * Lógica interna de movimentação (sempre executada dentro de transação)
 */
async function registerMovementInternal(
  input: RegisterMovementInput,
  tx: any
) {

  // Buscar tenantId do endereço de origem se não fornecido
  let tenantId = input.tenantId;
  if (tenantId === null || tenantId === undefined) {
    const fromLocation = await tx
      .select({ tenantId: warehouseLocations.tenantId })
      .from(warehouseLocations)
      .where(eq(warehouseLocations.id, input.fromLocationId))
      .limit(1);
    
    if (fromLocation[0]?.tenantId) {
      tenantId = fromLocation[0].tenantId;
    } else {
      // Se ainda não tiver tenantId, buscar do inventory
      const inventoryRecord = await tx
        .select({ tenantId: inventory.tenantId })
        .from(inventory)
        .where(
          and(
            eq(inventory.locationId, input.fromLocationId),
            eq(inventory.productId, input.productId)
          )
        )
        .limit(1);
      
      if (inventoryRecord[0]?.tenantId) {
        tenantId = inventoryRecord[0].tenantId;
      }
      // Se ainda null, continuar sem filtro de tenantId (endereço compartilhado como REC)
      // O filtro por locationId + productId já é suficientemente seletivo
    }
  }

  // FASE 1: BLOQUEIO PESSIMISTA + VALIDAÇÕES

  // 🔒 Bloquear registros de estoque da origem com SELECT FOR UPDATE
  // Ordenar por ID para evitar deadlocks
  // ✅ CORREÇÃO DE ESCOPO: Filtrar por status='available' para não incluir registros
  // quarantine/blocked do mesmo endereço na movimentação normal. Registros quarantine
  // pertencem à zona NCG e não devem bloquear a movimentação do saldo disponível.
  // Exceção: se adminReleaseAuthorized=true, incluir todos os status (liberação gerencial).
  const fromInventory = await tx
    .select()
    .from(inventory)
    .where(
      and(
        eq(inventory.locationId, input.fromLocationId),
        eq(inventory.productId, input.productId),
        input.batch ? eq(inventory.batch, input.batch) : sql`1=1`,
        tenantId ? eq(inventory.tenantId, tenantId) : sql`1=1`,
        // Movimentação normal: apenas saldo 'available'
        // Liberação gerencial: inclui 'blocked' e 'quarantine' também
        !input.adminReleaseAuthorized ? eq(inventory.status, 'available') : sql`1=1`
      )
    )
    .orderBy(inventory.id) // Ordenar para evitar deadlocks
    .for('update'); // 🔒 BLOQUEIO PESSIMISTA

  // Calcular saldo total na origem
  const totalQuantity = fromInventory.reduce((sum: number, item: any) => sum + item.quantity, 0);

  // Calcular quantidade reservada para picking
  const reservedStock = await tx
    .select({ total: sql<number>`COALESCE(SUM(${pickingAllocations.quantity}), 0)` })
    .from(pickingAllocations)
    .where(
      and(
        eq(pickingAllocations.locationId, input.fromLocationId),
        eq(pickingAllocations.productId, input.productId),
        input.batch ? eq(pickingAllocations.batch, input.batch) : sql`1=1`
      )
    );

  const reservedQuantity = Number(reservedStock[0]?.total ?? 0);
  const availableQuantity = totalQuantity - reservedQuantity;

  // ✅ REVALIDAÇÃO PÓS-LOCK (crítico para race conditions)
  if (availableQuantity < input.quantity) {
    throw new Error(
      `Saldo insuficiente. Total: ${totalQuantity}, Reservado: ${reservedQuantity}, Disponível: ${availableQuantity}, Solicitado: ${input.quantity}`
    );
  }

  if (fromInventory.length === 0) {
    throw new Error('Estoque não encontrado na origem');
  }

  // 🔒 VALIDAÇÃO DE STATUS RESTRITO (blocked e quarantine)
  // blocked: impede entrada E saída — requer liberação gerencial (admin)
  // quarantine: impede saída — requer liberação gerencial (admin); entrada livre
  const restrictedItems = fromInventory.filter(
    (item: any) => item.status === 'blocked' || item.status === 'quarantine'
  );
  if (restrictedItems.length > 0 && !input.adminReleaseAuthorized) {
    const status = restrictedItems[0].status;
    const label = status === 'blocked' ? 'Bloqueado' : 'Quarentena/NCG';
    throw new Error(
      `RESTRICTED_STATUS:${status}:Estoque com status "${label}" não pode ser movimentado sem liberação gerencial. Solicite autenticação de um administrador.`
    );
  }

  // 🔒 VALIDAÇÃO DE ENTRADA EM ENDEREÇO BLOQUEADO (blocked impede entrada)
  if (input.toLocationId && input.movementType !== 'disposal') {
    const destInventoryStatus = await tx
      .select({ status: inventory.status })
      .from(inventory)
      .where(
        and(
          eq(inventory.locationId, input.toLocationId),
          sql`${inventory.quantity} > 0`
        )
      )
      .limit(1);
    const destLocStatus = await tx
      .select({ status: warehouseLocations.status })
      .from(warehouseLocations)
      .where(eq(warehouseLocations.id, input.toLocationId))
      .limit(1);
    if (destLocStatus[0]?.status === 'blocked' && !input.adminReleaseAuthorized) {
      throw new Error(
        `RESTRICTED_STATUS:blocked:Endereço destino está Bloqueado e não pode receber itens sem liberação gerencial.`
      );
    }
  }

  // Validar regra de armazenagem do endereço destino (exceto para descarte)
  if (input.movementType !== "disposal") {
    if (!input.toLocationId) {
      throw new Error("Endereço destino é obrigatório para este tipo de movimentação");
    }

    const toLocation = await tx
      .select()
      .from(warehouseLocations)
      .where(eq(warehouseLocations.id, input.toLocationId))
      .limit(1);

    if (!toLocation[0]) {
      throw new Error("Endereço destino não encontrado");
    }

    // Se endereço é "single" (único item/lote), validar se já contém outro produto/lote
    if (toLocation[0].storageRule === "single") {
      const existingStock = await tx
        .select()
        .from(inventory)
        .where(
          and(
            eq(inventory.locationId, input.toLocationId),
            sql`${inventory.quantity} > 0` // Ignorar registros com quantity=0
          )
        )
        .limit(1);

      if (existingStock.length > 0) {
        const existing = existingStock[0];
        if (
          existing.productId !== input.productId ||
          existing.batch !== input.batch
        ) {
          throw new Error(
            `Endereço ${toLocation[0].code} é de único item/lote e já contém outro produto/lote`
          );
        }
      }
    }

    // ✅ VALIDAÇÃO DE MÚTIPLOS LOTES (MOVIDA PARA FASE 1)
    // Verificar se endereço pode receber este lote (zonas especiais vs storage)
    const { validateLocationForBatch } = await import("./locationValidation");
    const validation = await validateLocationForBatch(
      input.toLocationId,
      input.productId,
      input.batch || null
    );

    if (!validation.allowed) {
      throw new Error(validation.reason || "Endereço não pode receber este lote");
    }
  }

  // FASE 2: MODIFICAR DADOS (estoque já bloqueado)

  // Deduzir estoque da origem (usar registros já bloqueados)
  let remainingToMove = input.quantity;
  for (const stockItem of fromInventory) {
    if (remainingToMove <= 0) break;

    const toDeduct = Math.min(stockItem.quantity, remainingToMove);
    const newQuantity = stockItem.quantity - toDeduct;

    if (newQuantity <= 0) {
      // Remover registro se quantidade chegar a zero
      await tx.delete(inventory).where(eq(inventory.id, stockItem.id));
    } else {
      // Atualizar quantidade
      await tx.update(inventory)
        .set({ quantity: newQuantity })
        .where(eq(inventory.id, stockItem.id));
    }

    remainingToMove -= toDeduct;
  }

  // Adicionar estoque ao destino (exceto para descarte)
  if (input.movementType !== "disposal" && input.toLocationId) {
    // 🔒 Bloquear estoque do destino também
    const toInventory = await tx
      .select()
      .from(inventory)
      .where(
        and(
          eq(inventory.locationId, input.toLocationId),
          eq(inventory.productId, input.productId),
          input.batch ? eq(inventory.batch, input.batch) : sql`1=1`
        )
      )
      .limit(1);

    if (toInventory[0]) {
      // Atualizar quantidade existente
      await tx
        .update(inventory)
        .set({
          quantity: toInventory[0].quantity + input.quantity,
          expiryDate: fromInventory[0]?.expiryDate || toInventory[0].expiryDate,
        })
        .where(eq(inventory.id, toInventory[0].id));
    } else {
      // Buscar SKU do produto para gerar uniqueCode
      const product = await tx.select({ sku: products.sku })
        .from(products)
        .where(eq(products.id, input.productId))
        .limit(1);

      // Buscar zona do endereço de destino
      const toLocation = await tx.select({ zoneCode: warehouseZones.code })
        .from(warehouseLocations)
        .innerJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
        .where(eq(warehouseLocations.id, input.toLocationId))
        .limit(1);

      const { getUniqueCode } = await import("./utils/uniqueCode");

      // Criar novo registro (validação já foi feita na FASE 1)
      await tx.insert(inventory).values({
        productId: input.productId,
        locationId: input.toLocationId,
        batch: input.batch || null,
        quantity: input.quantity,
        expiryDate: fromInventory[0]?.expiryDate || null,
        status: "available",
        tenantId: tenantId || null,
        uniqueCode: getUniqueCode(product[0]?.sku || "", input.batch || null), // ✅ Adicionar uniqueCode
        labelCode: fromInventory[0]?.labelCode || null, // ✅ CORREÇÃO CRÍTICA: Copiar labelCode do origem
        locationZone: toLocation[0]?.zoneCode || null, // ✅ Adicionar locationZone
      });
    }
  }

  // Registrar movimentação no histórico
  await tx.insert(inventoryMovements).values({
    productId: input.productId,
    fromLocationId: input.fromLocationId,
    toLocationId: input.toLocationId || null,
    quantity: input.quantity,
    batch: input.batch || null,
    labelCode: fromInventory[0]?.labelCode || null, // ✅ Registrar labelCode na movimentação
    movementType: input.movementType,
    notes: input.notes || null,
    performedBy: input.performedBy,
    tenantId: tenantId || null,
    createdAt: new Date(),
  });

  // Atualizar status dos endereços
  await updateLocationStatus(input.fromLocationId);
  if (input.toLocationId) {
    await updateLocationStatus(input.toLocationId);
  }

  // Atualizar status da pré-alocação (se houver e se não for descarte)
  if (input.toLocationId) {
    await tx
      .update(receivingPreallocations)
      .set({ status: "allocated" })
      .where(
        and(
          eq(receivingPreallocations.productId, input.productId),
          eq(receivingPreallocations.locationId, input.toLocationId),
          input.batch 
            ? eq(receivingPreallocations.batch, input.batch)
            : sql`${receivingPreallocations.batch} IS NULL`,
          eq(receivingPreallocations.status, "pending")
        )
      )
      .limit(1);
  }

  return { success: true, message: "Movimentação registrada com sucesso" };
}

/**
 * Atualiza status de um endereço baseado no estoque
 * 
 * Lógica de status:
 * - Livre: sem produtos alocados
 * - Disponível: com produtos, mas aceita mais (multi-item)
 * - Ocupado: com produtos e não aceita mais (single-item)
 */
async function updateLocationStatus(locationId: number) {
  const dbConn = await getDb();
  if (!dbConn) return;

  // Buscar informações do endereço
  const [location] = await dbConn
    .select({
      storageRule: warehouseLocations.storageRule,
      currentStatus: warehouseLocations.status,
    })
    .from(warehouseLocations)
    .where(eq(warehouseLocations.id, locationId))
    .limit(1);

  if (!location) return;

  // Calcular quantidade total de produtos no endereço
  const stock = await dbConn
    .select({ total: sql<number>`COALESCE(SUM(${inventory.quantity}), 0)` })
    .from(inventory)
    .where(eq(inventory.locationId, locationId));

  const totalQuantity = Number(stock[0]?.total ?? 0);

  // Determinar novo status
  let newStatus: "available" | "available" | "occupied" | "blocked" | "counting";

  if (totalQuantity === 0) {
    // Sem produtos = Livre
    newStatus = "available";
  } else if (location.storageRule === "multi") {
    // Com produtos + multi-item = Disponível (aceita mais produtos)
    newStatus = "available";
  } else {
    // Com produtos + single-item = Ocupado (não aceita mais)
    newStatus = "occupied";
  }

  // Preservar status especiais (blocked, counting)
  if (location.currentStatus === "blocked" || location.currentStatus === "counting") {
    return; // Não alterar status especiais automaticamente
  }

  // Atualizar status apenas se mudou
  if (location.currentStatus !== newStatus) {
    await dbConn
      .update(warehouseLocations)
      .set({ status: newStatus })
      .where(eq(warehouseLocations.id, locationId));
  }
}

/**
 * Obtém histórico de movimentações
 */
export async function getMovementHistory(filters?: {
  productId?: number;
  locationId?: number;
  movementType?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}): Promise<any[]> {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  const conditions = [];
  if (filters?.productId) {
    conditions.push(eq(inventoryMovements.productId, filters.productId));
  }
  if (filters?.movementType) {
    conditions.push(eq(inventoryMovements.movementType, filters.movementType as any));
  }
  if (filters?.locationId) {
    conditions.push(
      sql`(${inventoryMovements.fromLocationId} = ${filters.locationId} OR ${inventoryMovements.toLocationId} = ${filters.locationId})`
    );
  }

  const results = await dbConn
    .select({
      id: inventoryMovements.id,
      productId: inventoryMovements.productId,
      productSku: products.sku,
      productDescription: products.description,
      fromLocationId: inventoryMovements.fromLocationId,
      fromLocationCode: sql<string>`fromLoc.code`,
      toLocationId: inventoryMovements.toLocationId,
      toLocationCode: sql<string>`toLoc.code`,
      quantity: inventoryMovements.quantity,
      batch: inventoryMovements.batch,
      movementType: inventoryMovements.movementType,
      notes: inventoryMovements.notes,
      createdAt: inventoryMovements.createdAt,
      performedByName: systemUsers.fullName,
    })
    .from(inventoryMovements)
    .innerJoin(products, eq(inventoryMovements.productId, products.id))
    .leftJoin(systemUsers, eq(inventoryMovements.performedBy, systemUsers.id))
    .leftJoin(sql`${warehouseLocations} as fromLoc`, sql`fromLoc.id = ${inventoryMovements.fromLocationId}`)
    .leftJoin(sql`${warehouseLocations} as toLoc`, sql`toLoc.id = ${inventoryMovements.toLocationId}`)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(inventoryMovements.createdAt))
    .limit(filters?.limit || 500);

  return results;
}

/**
 * Obtém produtos disponíveis em um endereço para movimentação
 * Calcula quantidade disponível (total - reservado)
 */
export async function getLocationProducts(locationId: number, tenantId?: number | null) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");
  
  let whereConditions = [eq(inventory.locationId, locationId)];
  
  // Aplicar filtro de tenantId se fornecido
  if (tenantId !== undefined && tenantId !== null) {
    whereConditions.push(eq(products.tenantId, tenantId));
  }
  
  const results = await dbConn
    .select({
      inventoryId: inventory.id,
      productId: inventory.productId,
      productSku: products.sku,
      productDescription: products.description,
      batch: inventory.batch,
      expiryDate: inventory.expiryDate,
      totalQuantity: inventory.quantity,
      reservedQuantity: sql<number>`COALESCE(SUM(${pickingAllocations.quantity}), 0)`,
      status: inventory.status,
      tenantId: products.tenantId,
    })
    .from(inventory)
    .innerJoin(products, eq(inventory.productId, products.id))
    .innerJoin(warehouseLocations, eq(inventory.locationId, warehouseLocations.id))
    .leftJoin(pickingAllocations, eq(pickingAllocations.locationId, warehouseLocations.id))
    .where(and(...whereConditions))
    .groupBy(
      inventory.id,
      inventory.productId,
      products.sku,
      products.description,
      inventory.batch,
      inventory.expiryDate,
      inventory.quantity,
      inventory.status,
      products.tenantId
    )
    .orderBy(products.sku);
  
  // Calcular quantidade disponível para cada item
  return results.map(item => ({
    ...item,
    quantity: item.totalQuantity - item.reservedQuantity, // Disponível = Total - Reservado
  }));
}
