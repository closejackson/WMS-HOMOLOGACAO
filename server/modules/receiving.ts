import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db";
import { 
  receivingOrders, 
  receivingOrderItems,
  inventory,
  inventoryMovements,
  products,
  warehouseLocations,
  warehouseZones
} from "../../drizzle/schema";

// ============================================================================
// RECEIVING ORDERS
// ============================================================================

export async function getReceivingOrderById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(receivingOrders).where(eq(receivingOrders.id, id)).limit(1);
  return result[0] || null;
}

export async function getReceivingOrderItemById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(receivingOrderItems).where(eq(receivingOrderItems.id, id)).limit(1);
  return result[0] || null;
}

export async function getReceivingOrderItems(receivingOrderId: number) {
  const db = await getDb();
  if (!db) return [];
  
  // Join com produtos para trazer informações completas
  const items = await db
    .select({
      item: receivingOrderItems,
      product: products,
    })
    .from(receivingOrderItems)
    .leftJoin(products, eq(receivingOrderItems.productId, products.id))
    .where(eq(receivingOrderItems.receivingOrderId, receivingOrderId));
  
  return items;
}

export async function createReceivingOrderItem(data: typeof receivingOrderItems.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(receivingOrderItems).values(data);
  return result;
}

export async function updateReceivingOrderItem(id: number, data: Partial<typeof receivingOrderItems.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(receivingOrderItems).set(data).where(eq(receivingOrderItems.id, id));
}

// ============================================================================
// CONFERÊNCIA E VALIDAÇÕES
// ============================================================================

export async function validateReceivingItem(
  itemId: number,
  receivedQuantity: number,
  batch: string,
  expiryDate: Date,
  serialNumber?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Buscar item e produto
  const item = await db
    .select({
      item: receivingOrderItems,
      product: products,
    })
    .from(receivingOrderItems)
    .leftJoin(products, eq(receivingOrderItems.productId, products.id))
    .where(eq(receivingOrderItems.id, itemId))
    .limit(1);
  
  if (!item[0]) {
    throw new Error("Item não encontrado");
  }
  
  const { item: receivingItem, product } = item[0];
  
  // Validações críticas
  const validations: { valid: boolean; errors: string[] } = {
    valid: true,
    errors: [],
  };
  
  // Validar divergência de quantidade
  if (receivedQuantity !== receivingItem.expectedQuantity) {
    validations.errors.push(
      `Divergência de quantidade: esperado ${receivingItem.expectedQuantity}, recebido ${receivedQuantity}`
    );
  }
  
  // Validar validade mínima (assumindo 90 dias como padrão)
  const today = new Date();
  const daysUntilExpiry = Math.floor((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysUntilExpiry < 90) {
    validations.errors.push(
      `Validade muito próxima: ${daysUntilExpiry} dias (mínimo 90 dias)`
    );
  }
  
  // Validar se produto exige controle de lote
  if (product?.requiresBatchControl && !batch) {
    validations.errors.push("Produto exige controle de lote");
  }
  
  // Validar se produto exige controle de serial
  if (product?.requiresSerialControl && !serialNumber) {
    validations.errors.push("Produto exige controle de número de série");
  }
  
  validations.valid = validations.errors.length === 0;
  
  return validations;
}

// ============================================================================
// QUARENTENA E LIBERAÇÃO
// ============================================================================

export async function moveToQuarantine(
  receivingOrderId: number,
  itemId: number,
  quantity: number,
  batch: string,
  expiryDate: Date,
  serialNumber: string | undefined,
  userId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Buscar item
  const item = await db
    .select()
    .from(receivingOrderItems)
    .where(eq(receivingOrderItems.id, itemId))
    .limit(1);
  
  if (!item[0]) {
    throw new Error("Item não encontrado");
  }
  
  // Buscar ordem de recebimento para pegar tenantId
  const order = await db
    .select()
    .from(receivingOrders)
    .where(eq(receivingOrders.id, receivingOrderId))
    .limit(1);
  
  if (!order[0]) {
    throw new Error("Ordem de recebimento não encontrada");
  }
  
  // Buscar SKU do produto para gerar uniqueCode
  const product = await db.select({ sku: products.sku })
    .from(products)
    .where(eq(products.id, item[0].productId))
    .limit(1);

  // Buscar zona do endereço de quarentena (locationId = 1)
  const quarantineLocation = await db.select({ zoneCode: warehouseZones.code })
    .from(warehouseLocations)
    .innerJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
    .where(eq(warehouseLocations.id, 1))
    .limit(1);

  const { getUniqueCode } = await import("../utils/uniqueCode");

  // Criar registro de inventário em quarentena (locationId = 1 como quarentena temporária)
  const inventoryResult = await db.insert(inventory).values({
    tenantId: order[0].tenantId,
    productId: item[0].productId,
    locationId: 1, // Zona de quarentena
    batch,
    expiryDate,
    serialNumber,
    quantity,
    status: "quarantine",
    uniqueCode: getUniqueCode(product[0]?.sku || "", batch), // ✅ Adicionar uniqueCode
    locationZone: quarantineLocation[0]?.zoneCode || null, // ✅ Adicionar locationZone
  });
  
  // Registrar movimentação
  await db.insert(inventoryMovements).values({
    tenantId: order[0].tenantId,
    productId: item[0].productId,
    batch,
    serialNumber,
    toLocationId: 1,
    quantity,
    movementType: "receiving",
    referenceType: "receiving_order",
    referenceId: receivingOrderId,
    performedBy: userId,
    notes: "Movido para quarentena após recebimento",
  });

  // Atualizar saldo de inventário em tempo real
  const inventorySync = await import("./inventory-sync");
  await inventorySync.updateInventoryBalance(
    item[0].productId,
    1, // locationId de quarentena
    batch,
    quantity,
    order[0].tenantId,
    expiryDate || null,
    serialNumber || null
  );
  
  // CORREÇÃO CRÍTICA: Atualizar status do endereço após criar estoque
  // Status de endereço é derivado do estoque (available → occupied)
  const locationsModule = await import("./locations");
  await locationsModule.updateLocationStatus(1); // locationId de quarentena
  
  // Atualizar item de recebimento
  await db.update(receivingOrderItems).set({
    receivedQuantity: quantity,
    batch,
    expiryDate,
    serialNumber,
    status: "in_quarantine",
  }).where(eq(receivingOrderItems.id, itemId));
  
  return { success: true, inventoryId: Number((inventoryResult as any).insertId) };
}

export async function approveQuarantine(
  itemId: number,
  userId: number,
  signature: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Atualizar status do item
  await db.update(receivingOrderItems).set({
    status: "approved",
    approvedBy: userId,
    approvedAt: new Date(),
  }).where(eq(receivingOrderItems.id, itemId));
  
  // Buscar inventário relacionado e atualizar status
  const item = await db
    .select()
    .from(receivingOrderItems)
    .where(eq(receivingOrderItems.id, itemId))
    .limit(1);
  
  if (item[0]) {
    // Atualizar status do inventário para disponível
    await db.update(inventory).set({
      status: "available",
    }).where(
      and(
        eq(inventory.productId, item[0].productId),
        eq(inventory.batch, item[0].batch || ""),
        eq(inventory.status, "quarantine")
      )
    );
  }
  
  return { success: true };
}

export async function rejectQuarantine(
  itemId: number,
  userId: number,
  reason: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Atualizar status do item
  await db.update(receivingOrderItems).set({
    status: "rejected",
    rejectionReason: reason,
    approvedBy: userId,
    approvedAt: new Date(),
  }).where(eq(receivingOrderItems.id, itemId));
  
  // Buscar inventário relacionado e atualizar status
  const item = await db
    .select()
    .from(receivingOrderItems)
    .where(eq(receivingOrderItems.id, itemId))
    .limit(1);
  
  if (item[0]) {
    // Atualizar status do inventário para quarantine (rejeição: permite entrada, bloqueia saída até liberação gerencial)
    await db.update(inventory).set({
      status: "quarantine",
    }).where(
      and(
        eq(inventory.productId, item[0].productId),
        eq(inventory.batch, item[0].batch || ""),
        eq(inventory.status, "quarantine")
      )
    );
  }
  
  return { success: true };
}

// ============================================================================
// EXCLUSÃO DE ORDENS
// ============================================================================

export async function deleteReceivingOrder(orderId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Soft delete: atualizar status ao invés de deletar fisicamente
  // Mantém rastreabilidade e conformidade com ANVISA (RDC 430/2020)
  // Nota: itens da ordem são mantidos para auditoria
  await db
    .update(receivingOrders)
    .set({ status: "cancelled" })
    .where(eq(receivingOrders.id, orderId));
}

export async function deleteReceivingOrders(orderIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Soft delete: atualizar status ao invés de deletar fisicamente
  // Mantém rastreabilidade e conformidade com ANVISA (RDC 430/2020)
  // Nota: itens das ordens são mantidos para auditoria
  for (const orderId of orderIds) {
    await db
      .update(receivingOrders)
      .set({ status: "cancelled" })
      .where(eq(receivingOrders.id, orderId));
  }
}
