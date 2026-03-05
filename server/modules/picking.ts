import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../db";
import { 
  pickingOrders, 
  pickingOrderItems,
  inventory,
  inventoryMovements,
  products,
  contracts,
  warehouseLocations
} from "../../drizzle/schema";

// ============================================================================
// PICKING ORDERS
// ============================================================================

export async function getPickingOrderById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(pickingOrders).where(eq(pickingOrders.id, id)).limit(1);
  return result[0] || null;
}

export async function getPickingOrdersByTenant(tenantId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(pickingOrders)
    .where(eq(pickingOrders.tenantId, tenantId))
    .orderBy(desc(pickingOrders.createdAt));
}

export async function getAllPickingOrders() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(pickingOrders)
    .orderBy(desc(pickingOrders.createdAt));
}

export async function createPickingOrder(data: typeof pickingOrders.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(pickingOrders).values(data);
  return result;
}

export async function updatePickingOrder(id: number, data: Partial<typeof pickingOrders.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(pickingOrders).set(data).where(eq(pickingOrders.id, id));
}

export async function deletePickingOrder(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Soft delete: atualizar status ao invés de deletar fisicamente
  // Mantém rastreabilidade e conformidade com ANVISA (RDC 430/2020)
  // Nota: itens da ordem são mantidos para auditoria
  await db.update(pickingOrders).set({ status: "cancelled" }).where(eq(pickingOrders.id, id));
}

// ============================================================================
// PICKING ORDER ITEMS
// ============================================================================

export async function getPickingOrderItems(pickingOrderId: number) {
  const db = await getDb();
  if (!db) return [];
  
  // Join com produtos para trazer informações completas
  const items = await db
    .select({
      item: pickingOrderItems,
      product: products,
    })
    .from(pickingOrderItems)
    .leftJoin(products, eq(pickingOrderItems.productId, products.id))
    .where(eq(pickingOrderItems.pickingOrderId, pickingOrderId));
  
  return items;
}

export async function getPickingOrderItemById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(pickingOrderItems).where(eq(pickingOrderItems.id, id)).limit(1);
  return result[0] || null;
}

export async function createPickingOrderItem(data: typeof pickingOrderItems.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(pickingOrderItems).values(data);
  return result;
}

export async function updatePickingOrderItem(id: number, data: Partial<typeof pickingOrderItems.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(pickingOrderItems).set(data).where(eq(pickingOrderItems.id, id));
}

// ============================================================================
// ALOCAÇÃO DE ESTOQUE COM REGRAS FEFO/FIFO
// ============================================================================

/**
 * Aloca estoque para um item de picking seguindo regras parametrizáveis
 * FEFO (First Expire First Out) - Prioriza lotes com validade mais próxima
 * FIFO (First In First Out) - Prioriza lotes mais antigos
 */
export async function allocateInventory(
  tenantId: number,
  productId: number,
  requestedQuantity: number,
  allocationRule: "fefo" | "fifo" = "fefo"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Buscar estoque disponível do produto
  let availableInventory;
  
  if (allocationRule === "fefo") {
    // FEFO: Ordenar por data de validade (mais próxima primeiro)
    availableInventory = await db
      .select()
      .from(inventory)
      .where(
        and(
          eq(inventory.tenantId, tenantId),
          eq(inventory.productId, productId),
          eq(inventory.status, "available"),
          sql`${inventory.quantity} > 0`
        )
      )
      .orderBy(inventory.expiryDate); // Validade mais próxima primeiro
  } else {
    // FIFO: Ordenar por data de entrada (mais antigo primeiro)
    availableInventory = await db
      .select()
      .from(inventory)
      .where(
        and(
          eq(inventory.tenantId, tenantId),
          eq(inventory.productId, productId),
          eq(inventory.status, "available"),
          sql`${inventory.quantity} > 0`
        )
      )
      .orderBy(inventory.createdAt); // Mais antigo primeiro
  }
  
  // Alocar quantidade necessária dos lotes disponíveis
  const allocations: Array<{
    inventoryId: number;
    locationId: number;
    batch: string;
    expiryDate: Date | null;
    serialNumber: string | null;
    quantity: number;
  }> = [];
  
  let remainingQuantity = requestedQuantity;
  
  for (const inv of availableInventory) {
    if (remainingQuantity <= 0) break;
    
    const quantityToAllocate = Math.min(remainingQuantity, inv.quantity);
    
    allocations.push({
      inventoryId: inv.id,
      locationId: inv.locationId,
      batch: inv.batch || "",
      expiryDate: inv.expiryDate,
      serialNumber: inv.serialNumber,
      quantity: quantityToAllocate,
    });
    
    remainingQuantity -= quantityToAllocate;
  }
  
  return {
    allocations,
    fullyAllocated: remainingQuantity === 0,
    shortQuantity: remainingQuantity > 0 ? remainingQuantity : 0,
  };
}

// ============================================================================
// PICKING GUIADO
// ============================================================================

/**
 * Inicia processo de picking para um pedido
 * Retorna instruções de picking ordenadas por localização
 */
export async function startPicking(pickingOrderId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Buscar ordem e tenant
  const order = await getPickingOrderById(pickingOrderId);
  if (!order) throw new Error("Ordem de picking não encontrada");
  
  // Buscar regra de alocação do contrato do cliente
  const contractResult = await db
    .select()
    .from(contracts)
    .where(eq(contracts.tenantId, order.tenantId))
    .limit(1);
  
  // Usar FEFO como padrão (regra mais comum para farmacêuticos)
  const allocationRule = "fefo";
  
  // Buscar itens do pedido
  const items = await getPickingOrderItems(pickingOrderId);
  
  // Filtrar apenas itens pendentes (não separados ainda)
  const pendingItems = items.filter(({ item }) => 
    item && item.status === 'pending'
  );
  
  // Calcular progresso
  const totalItems = items.length;
  const completedItems = items.filter(({ item }) => item && item.status === 'picked').length;
  
  // Alocar estoque para cada item pendente
  const pickingInstructions = [];
  
  
  for (const { item, product } of pendingItems) {
    if (!item || !product) continue;
    
    // Calcular quantidade restante (para itens parcialmente separados)
    const remainingQuantity = item.requestedQuantity - (item.pickedQuantity || 0);
    

    
    const allocation = await allocateInventory(
      order.tenantId,
      item.productId,
      remainingQuantity, // Usar quantidade restante ao invés da total
      allocationRule as "fefo" | "fifo"
    );
    

    
    // Buscar código do endereço para cada alocação
    const allocationsWithLocation = await Promise.all(
      allocation.allocations.map(async (alloc) => {
        const locationResult = await db
          .select()
          .from(warehouseLocations)
          .where(eq(warehouseLocations.id, alloc.locationId))
          .limit(1);
        
        return {
          ...alloc,
          locationCode: locationResult[0]?.code || "UNKNOWN",
        };
      })
    );
    
    pickingInstructions.push({
      itemId: item.id,
      productId: item.productId,
      productName: product.description,
      productSku: product.sku,
      productGtin: product.gtin,
      requestedQuantity: item.requestedQuantity,
      allocations: allocationsWithLocation,
      fullyAllocated: allocation.fullyAllocated,
      shortQuantity: allocation.shortQuantity,
    });
    
    // Salvar fromLocationId no item (usar primeira alocação)
    if (allocationsWithLocation.length > 0) {
      await db
        .update(pickingOrderItems)
        .set({ 
          fromLocationId: allocationsWithLocation[0].locationId,
          batch: allocationsWithLocation[0].batch,
          expiryDate: allocationsWithLocation[0].expiryDate,
        })
        .where(eq(pickingOrderItems.id, item.id));
    } else {
    }
  }
  
  // Atualizar status da ordem para "picking" (se ainda estiver pending)
  if (order.status === 'pending') {
    await updatePickingOrder(pickingOrderId, {
      status: "picking",
      assignedTo: userId,
    });
  }
  
  return {
    instructions: pickingInstructions,
    progress: {
      total: totalItems,
      completed: completedItems,
      remaining: pendingItems.length,
    },
  };
}

/**
 * Confirma picking de um item
 */
export async function confirmPicking(
  itemId: number,
  pickedQuantity: number,
  batch: string,
  expiryDate: Date,
  serialNumber: string | undefined,
  fromLocationId: number,
  userId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Buscar item
  const item = await getPickingOrderItemById(itemId);
  if (!item) throw new Error("Item não encontrado");
  
  // Buscar ordem para pegar tenantId
  const order = await getPickingOrderById(item.pickingOrderId);
  if (!order) throw new Error("Ordem não encontrada");
  
  // Atualizar item com dados do picking
  const status = pickedQuantity < item.requestedQuantity ? "short_picked" : "picked";
  
  await updatePickingOrderItem(itemId, {
    pickedQuantity,
    batch,
    expiryDate,
    serialNumber,
    fromLocationId,
    status,
  });
  
  // Registrar movimentação
  await db.insert(inventoryMovements).values({
    tenantId: order.tenantId,
    productId: item.productId,
    batch,
    serialNumber,
    fromLocationId,
    quantity: pickedQuantity,
    movementType: "picking",
    referenceType: "picking_order",
    referenceId: item.pickingOrderId,
    performedBy: userId,
    notes: `Picking do pedido ${order.orderNumber}`,
  });

  // Atualizar saldo de inventário em tempo real (deduzir)
  const inventorySync = await import("./inventory-sync");
  await inventorySync.updateInventoryBalance(
    item.productId,
    fromLocationId,
    batch,
    -pickedQuantity, // Saída negativa
    order.tenantId,
    expiryDate || null,
    serialNumber || null
  );
  
  // CORREÇÃO CRÍTICA: Atualizar status do endereço após deduzir estoque
  // Status de endereço é derivado do estoque (occupied → available se quantity = 0)
  const locationsModule = await import("./locations");
  await locationsModule.updateLocationStatus(fromLocationId);
  
  return { success: true, status };
}

/**
 * Finaliza ordem de picking
 */
export async function finishPicking(pickingOrderId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Verificar se todos os itens foram separados
  const items = await getPickingOrderItems(pickingOrderId);
  const allPicked = items.every(({ item }) => 
    item && (item.status === "picked" || item.status === "short_picked")
  );
  
  if (!allPicked) {
    throw new Error("Nem todos os itens foram separados");
  }
  
  // Atualizar ordem
  await updatePickingOrder(pickingOrderId, {
    status: "picked",
    pickedBy: userId,
    pickedAt: new Date(),
  });
  
  return { success: true };
}
