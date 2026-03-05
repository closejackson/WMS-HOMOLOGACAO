import { getDb } from "../db";
import { receivingConferences, receivingDivergences, receivingOrderItems, receivingOrders, inventory, inventoryMovements, users, products, warehouseZones, warehouseLocations } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

/**
 * Registra uma conferência parcial de um item
 */
export async function registerPartialConference(data: {
  receivingOrderItemId: number;
  batch: string | null;
  quantityConferenced: number;
  conferencedBy: number;
  notes?: string;
}) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  // Buscar item da ordem
  const [item] = await dbConn
    .select()
    .from(receivingOrderItems)
    .where(eq(receivingOrderItems.id, data.receivingOrderItemId));

  if (!item) {
    throw new Error("Item da ordem de recebimento não encontrado");
  }

  // Calcular total já conferido
  const conferences = await dbConn
    .select({
      totalConferenced: sql<number>`COALESCE(SUM(${receivingConferences.quantityConferenced}), 0)`,
    })
    .from(receivingConferences)
    .where(eq(receivingConferences.receivingOrderItemId, data.receivingOrderItemId));

  const totalConferenced = Number(conferences[0]?.totalConferenced || 0);
  const newTotal = totalConferenced + data.quantityConferenced;
  const pendingQuantity = item.expectedQuantity - newTotal;

  // Validar se não está conferindo mais do que o esperado
  if (newTotal > item.expectedQuantity) {
    throw new Error(
      `Quantidade conferida (${newTotal}) excede quantidade esperada (${item.expectedQuantity}). Sobra de ${newTotal - item.expectedQuantity} unidades.`
    );
  }

  // Registrar conferência
  await dbConn.insert(receivingConferences).values({
    receivingOrderItemId: data.receivingOrderItemId,
    batch: data.batch,
    quantityConferenced: data.quantityConferenced,
    conferencedBy: data.conferencedBy,
    notes: data.notes,
  });

  // Atualizar receivedQuantity no item
  await dbConn
    .update(receivingOrderItems)
    .set({ receivedQuantity: newTotal })
    .where(eq(receivingOrderItems.id, data.receivingOrderItemId));

  // Verificar se todos os itens da ordem foram conferidos
  const isComplete = newTotal >= item.expectedQuantity;
  if (isComplete) {
    console.log(`[Conference] Item ${data.receivingOrderItemId} completo. Verificando status da ordem ${item.receivingOrderId}...`);
    await checkAndUpdateOrderStatus(item.receivingOrderId);
  } else {
    console.log(`[Conference] Item ${data.receivingOrderItemId} ainda pendente: ${newTotal}/${item.expectedQuantity}`);
  }

  return {
    success: true,
    totalConferenced: newTotal,
    expectedQuantity: item.expectedQuantity,
    pendingQuantity: Math.max(0, pendingQuantity),
    isComplete,
  };
}

/**
 * Obter histórico de conferências de um item
 */
export async function getConferenceHistory(receivingOrderItemId: number) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  const history = await dbConn
    .select({
      id: receivingConferences.id,
      batch: receivingConferences.batch,
      quantityConferenced: receivingConferences.quantityConferenced,
      conferencedAt: receivingConferences.conferencedAt,
      notes: receivingConferences.notes,
      conferencedByName: users.name,
      conferencedByEmail: users.email,
    })
    .from(receivingConferences)
    .leftJoin(users, eq(receivingConferences.conferencedBy, users.id))
    .where(eq(receivingConferences.receivingOrderItemId, receivingOrderItemId))
    .orderBy(receivingConferences.conferencedAt);

  return history;
}

/**
 * Calcular saldo pendente de um item
 */
export async function getPendingBalance(receivingOrderItemId: number) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  const [item] = await dbConn
    .select()
    .from(receivingOrderItems)
    .where(eq(receivingOrderItems.id, receivingOrderItemId));

  if (!item) {
    throw new Error("Item não encontrado");
  }

  const conferences = await dbConn
    .select({
      totalConferenced: sql<number>`COALESCE(SUM(${receivingConferences.quantityConferenced}), 0)`,
    })
    .from(receivingConferences)
    .where(eq(receivingConferences.receivingOrderItemId, receivingOrderItemId));

  const totalConferenced = Number(conferences[0]?.totalConferenced || 0);
  const pendingQuantity = item.expectedQuantity - totalConferenced;

  return {
    expectedQuantity: item.expectedQuantity,
    totalConferenced,
    pendingQuantity: Math.max(0, pendingQuantity),
    isComplete: totalConferenced >= item.expectedQuantity,
    hasDivergence: totalConferenced !== item.expectedQuantity,
  };
}

/**
 * Registrar divergência (sobra ou falta)
 */
export async function registerDivergence(data: {
  receivingOrderItemId: number;
  batch: string | null;
  reportedBy: number;
}) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  const balance = await getPendingBalance(data.receivingOrderItemId);

  if (!balance.hasDivergence) {
    throw new Error("Não há divergência para registrar");
  }

  const differenceQuantity = balance.totalConferenced - balance.expectedQuantity;
  const divergenceType = differenceQuantity < 0 ? "shortage" : "surplus";

  // Verificar se já existe divergência pendente para este item
  const [existing] = await dbConn
    .select()
    .from(receivingDivergences)
    .where(
      and(
        eq(receivingDivergences.receivingOrderItemId, data.receivingOrderItemId),
        eq(receivingDivergences.status, "pending")
      )
    );

  if (existing) {
    throw new Error("Já existe uma divergência pendente para este item");
  }

  // Registrar divergência
  const [result] = await dbConn.insert(receivingDivergences).values({
    receivingOrderItemId: data.receivingOrderItemId,
    divergenceType,
    expectedQuantity: balance.expectedQuantity,
    receivedQuantity: balance.totalConferenced,
    differenceQuantity,
    batch: data.batch,
    reportedBy: data.reportedBy,
  });

  return {
    id: result.insertId,
    divergenceType,
    differenceQuantity,
    requiresApproval: true,
  };
}

/**
 * Aprovar divergência (apenas supervisor/admin)
 */
export async function approveDivergence(data: {
  divergenceId: number;
  approvedBy: number;
  justification: string;
}) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  // Buscar divergência
  const [divergence] = await dbConn
    .select()
    .from(receivingDivergences)
    .where(eq(receivingDivergences.id, data.divergenceId));

  if (!divergence) {
    throw new Error("Divergência não encontrada");
  }

  if (divergence.status !== "pending") {
    throw new Error("Divergência já foi processada");
  }

  // Atualizar divergência
  await dbConn
    .update(receivingDivergences)
    .set({
      status: "approved",
      approvedBy: data.approvedBy,
      approvedAt: new Date(),
      justification: data.justification,
    })
    .where(eq(receivingDivergences.id, data.divergenceId));

  // Atualizar status do item para aprovado
  await dbConn
    .update(receivingOrderItems)
    .set({ status: "approved" })
    .where(eq(receivingOrderItems.id, divergence.receivingOrderItemId));

  return { success: true };
}

/**
 * Listar divergências pendentes
 */
export async function getPendingDivergences(tenantId?: number) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  // Query base
  let query = dbConn
    .select({
      id: receivingDivergences.id,
      divergenceType: receivingDivergences.divergenceType,
      expectedQuantity: receivingDivergences.expectedQuantity,
      receivedQuantity: receivingDivergences.receivedQuantity,
      differenceQuantity: receivingDivergences.differenceQuantity,
      batch: receivingDivergences.batch,
      status: receivingDivergences.status,
      reportedAt: receivingDivergences.reportedAt,
      reportedByName: users.name,
      // Dados do item
      itemId: receivingOrderItems.id,
      productId: receivingOrderItems.productId,
    })
    .from(receivingDivergences)
    .leftJoin(users, eq(receivingDivergences.reportedBy, users.id))
    .leftJoin(receivingOrderItems, eq(receivingDivergences.receivingOrderItemId, receivingOrderItems.id))
    .where(eq(receivingDivergences.status, "pending"))
    .orderBy(receivingDivergences.reportedAt);

  return await query;
}

/**
 * Verificar se todos os itens foram conferidos e endereçar automaticamente ao REC
 */
async function checkAndUpdateOrderStatus(receivingOrderId: number) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  // Buscar ordem de recebimento
  const [order] = await dbConn
    .select()
    .from(receivingOrders)
    .where(eq(receivingOrders.id, receivingOrderId));

  if (!order || !order.receivingLocationId) {
    console.log(`[Conference] Ordem ${receivingOrderId} sem endereço REC alocado`);
    return;
  }

  // Buscar todos os itens da ordem
  const items = await dbConn
    .select()
    .from(receivingOrderItems)
    .where(eq(receivingOrderItems.receivingOrderId, receivingOrderId));

  console.log(`[Conference] Verificando status da ordem ${receivingOrderId}:`);
  console.log(`[Conference] Total de itens: ${items.length}`);
  items.forEach((item, idx) => {
    console.log(`[Conference] Item ${idx + 1}: esperado=${item.expectedQuantity}, recebido=${item.receivedQuantity}, completo=${item.receivedQuantity >= item.expectedQuantity}`);
  });

  // Verificar se todos os itens foram conferidos completamente
  const allConferenced = items.every(item => item.receivedQuantity >= item.expectedQuantity);
  console.log(`[Conference] Todos os itens conferidos? ${allConferenced}`);

  if (allConferenced) {
    console.log(`[Conference] ✅ Todos os itens conferidos! Iniciando endereçamento automático ao REC ${order.receivingLocationId}`);
    
    // Endereçar automaticamente cada item ao endereço REC alocado
    for (const item of items) {
      // Buscar conferências do item para obter lote e validade
      const conferences = await dbConn
        .select()
        .from(receivingConferences)
        .where(eq(receivingConferences.receivingOrderItemId, item.id));
      
      // Agrupar por lote
      const batchGroups = new Map<string, { quantity: number; expiryDate: Date | null }>();
      
      for (const conf of conferences) {
        const batchKey = conf.batch || "SEM_LOTE";
        const existing = batchGroups.get(batchKey) || { quantity: 0, expiryDate: item.expiryDate };
        existing.quantity += conf.quantityConferenced;
        batchGroups.set(batchKey, existing);
      }
      
      // Buscar SKU do produto para gerar uniqueCode
      const product = await dbConn.select({ sku: products.sku })
        .from(products)
        .where(eq(products.id, item.productId))
        .limit(1);

      const { getUniqueCode } = await import("../utils/uniqueCode");

      // Buscar zona do endereço de recebimento
      const recLocation = await dbConn.select({ zoneCode: warehouseZones.code })
        .from(warehouseLocations)
        .innerJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
        .where(eq(warehouseLocations.id, order.receivingLocationId))
        .limit(1);

      // Criar registro de estoque para cada lote
      for (const [batch, data] of Array.from(batchGroups)) {
        // CORREÇÃO CRÍTICA: Criar estoque com status 'quarantine' ao invés de 'available'
        // Fluxo correto: Conferência → Quarentena → Aprovação de Qualidade → Disponível
        // Conformidade com ANVISA (RDC 430/2020) - Quarentena obrigatória
        await dbConn.insert(inventory).values({
          productId: item.productId,
          locationId: order.receivingLocationId,
          tenantId: order.tenantId,
          quantity: data.quantity,
          batch: batch === "SEM_LOTE" ? null : batch,
          expiryDate: data.expiryDate,
          status: "quarantine", // Alterado de 'available' para 'quarantine'
          uniqueCode: getUniqueCode(product[0]?.sku || "", batch === "SEM_LOTE" ? null : batch), // ✅ Adicionar uniqueCode
          locationZone: recLocation[0]?.zoneCode || null, // ✅ Adicionar locationZone
        });
        
        // Registrar movimentação
        await dbConn.insert(inventoryMovements).values({
          productId: item.productId,
          tenantId: order.tenantId,
          fromLocationId: null,
          toLocationId: order.receivingLocationId,
          quantity: data.quantity,
          batch: batch === "SEM_LOTE" ? null : batch,
          movementType: "receiving",
          referenceType: "receiving_order",
          referenceId: receivingOrderId,
          performedBy: order.createdBy,
          notes: `Endereçamento automático após conferência - NF-e ${order.nfeNumber} - Status: Quarentena (aguardando aprovação de qualidade)`,
        });

        // Atualizar saldo de inventário em tempo real
        const inventorySync = await import("./inventory-sync");
        await inventorySync.updateInventoryBalance(
          item.productId,
          order.receivingLocationId,
          batch === "SEM_LOTE" ? null : batch,
          data.quantity,
          order.tenantId,
          data.expiryDate || null,
          null
        );
        
        // CORREÇÃO CRÍTICA: Atualizar status do endereço após criar estoque
        // Status de endereço é derivado do estoque (available → occupied)
        const locationsModule = await import("./locations");
        await locationsModule.updateLocationStatus(order.receivingLocationId);
      }
      
      // Atualizar addressedQuantity do item
      await dbConn
        .update(receivingOrderItems)
        .set({ addressedQuantity: item.receivedQuantity })
        .where(eq(receivingOrderItems.id, item.id));
    }
    
    // CORREÇÃO CRÍTICA: Atualizar status da ordem para 'in_quarantine' ao invés de 'completed'
    // O status 'completed' só deve ser usado após aprovação de qualidade
    await dbConn
      .update(receivingOrders)
      .set({ status: "in_quarantine" })
      .where(eq(receivingOrders.id, receivingOrderId));
    
    console.log(`[Conference] ✅ Ordem ${receivingOrderId} endereçada e movida para quarentena (aguardando aprovação de qualidade)`);
  } else {
    console.log(`[Conference] ⏳ Ordem ${receivingOrderId} ainda possui itens pendentes de conferência`);
  }
}
