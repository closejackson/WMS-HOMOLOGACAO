import { getDb } from "./db";
import {
  pickingOrders,
  pickingOrderItems,
  pickingAllocations,
  inventory,
  products,
  warehouseLocations,
  tenants,
} from "../drizzle/schema";
import { eq, and, isNull, or, sql, gt } from "drizzle-orm";
import { getUniqueCode } from "./utils/uniqueCode";
import { toMySQLDate } from "../shared/utils";

/**
 * Pré-alocação de lotes e endereços para picking
 * Implementa FEFO, FIFO e Direcionado conforme regra do tenant
 */

interface AllocationInput {
  pickingOrderId: number;
  tenantId: number;
}

interface AllocationResult {
  success: boolean;
  allocations: number;
  message?: string;
}

/**
 * Gera pré-alocações para um pedido de picking
 * Aplica regra do tenant (FEFO, FIFO ou Direcionado)
 */
export async function generatePickingAllocations(
  input: AllocationInput
): Promise<AllocationResult> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const { pickingOrderId, tenantId } = input;

  // 1. Buscar regra de picking do tenant
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) {
    return { success: false, allocations: 0, message: "Tenant não encontrado" };
  }

  const pickingRule = tenant.pickingRule; // "FEFO" | "FIFO" | "Direcionado"

  // 2. Buscar itens do pedido
  const orderItems = await db
    .select()
    .from(pickingOrderItems)
    .where(eq(pickingOrderItems.pickingOrderId, pickingOrderId));

  if (orderItems.length === 0) {
    return { success: false, allocations: 0, message: "Pedido sem itens" };
  }

  // 3. Para cada item, alocar lotes e endereços
  const allocations: any[] = [];
  let sequence = 1;

  for (const item of orderItems) {
    const productId = item.productId;
    const quantityNeeded = item.requestedQuantity;

    // ✅ CORREÇÃO: Se o item já tem batch e inventoryId, significa que foi criado com a nova lógica
    // (separado por lote). Neste caso, criar apenas 1 alocação direta para este lote específico.
    if (item.batch && item.inventoryId) {
      // Buscar dados do inventário específico
      const [inv] = await db
        .select({
          id: inventory.id,
          locationId: inventory.locationId,
          locationCode: warehouseLocations.code,
          batch: inventory.batch,
          expiryDate: inventory.expiryDate,
          quantity: inventory.quantity,
        })
        .from(inventory)
        .leftJoin(warehouseLocations, eq(inventory.locationId, warehouseLocations.id))
        .where(eq(inventory.id, item.inventoryId))
        .limit(1);

      if (inv) {
        const [product] = await db
          .select()
          .from(products)
          .where(eq(products.id, productId))
          .limit(1);

        if (product) {
          const unitsPerBox = product.unitsPerBox || 1;
          const isFractional = quantityNeeded < unitsPerBox;

          allocations.push({
            pickingOrderId,
            productId,
            productSku: product.sku,
            locationId: inv.locationId,
            locationCode: inv.locationCode,
            batch: inv.batch,
            expiryDate: inv.expiryDate,
            uniqueCode: getUniqueCode(product.sku, inv.batch), // ✅ Adicionar uniqueCode
            quantity: quantityNeeded,
            isFractional,
            sequence: sequence++,
            status: "pending",
            pickedQuantity: 0,
          });
        }
      }
      continue; // Pular para o próximo item
    }

    // ⚠️ LEGADO: Item sem batch (criado com código antigo, agrupado por SKU)
    // Buscar produto para verificar unitsPerBox
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (!product) continue;

    const unitsPerBox = product.unitsPerBox || 1;

    // Buscar inventário disponível conforme regra
    let inventoryRecords: any[] = [];

    if (pickingRule === "FEFO") {
      // FEFO: Validade mais próxima primeiro, NULL por último
      inventoryRecords = await db
        .select({
          id: inventory.id,
          locationId: inventory.locationId,
          locationCode: warehouseLocations.code,
          batch: inventory.batch,
          expiryDate: inventory.expiryDate,
          labelCode: inventory.labelCode,
          quantity: inventory.quantity,
        })
        .from(inventory)
        .leftJoin(
          warehouseLocations,
          eq(inventory.locationId, warehouseLocations.id)
        )
        .where(
          and(
            eq(inventory.productId, productId),
            eq(inventory.tenantId, tenantId),
            eq(inventory.status, "available"),
            gt(inventory.quantity, 0)
          )
        )
        .orderBy(
          sql`CASE WHEN ${inventory.expiryDate} IS NULL THEN 1 ELSE 0 END`,
          inventory.expiryDate
        );
    } else if (pickingRule === "FIFO") {
      // FIFO: Data de entrada mais antiga (createdAt)
      inventoryRecords = await db
        .select({
          id: inventory.id,
          locationId: inventory.locationId,
          locationCode: warehouseLocations.code,
          batch: inventory.batch,
          expiryDate: inventory.expiryDate,
          labelCode: inventory.labelCode,
          quantity: inventory.quantity,
        })
        .from(inventory)
        .leftJoin(
          warehouseLocations,
          eq(inventory.locationId, warehouseLocations.id)
        )
        .where(
          and(
            eq(inventory.productId, productId),
            eq(inventory.tenantId, tenantId),
            eq(inventory.status, "available"),
            gt(inventory.quantity, 0)
          )
        )
        .orderBy(inventory.createdAt);
    } else {
      // Direcionado: usar endereços definidos manualmente (fromLocationId)
      if (!item.fromLocationId) {
        console.warn(
          `Item ${item.id} sem fromLocationId definido (regra Direcionado)`
        );
        continue;
      }

      inventoryRecords = await db
        .select({
          id: inventory.id,
          locationId: inventory.locationId,
          locationCode: warehouseLocations.code,
          batch: inventory.batch,
          expiryDate: inventory.expiryDate,
          labelCode: inventory.labelCode,
          quantity: inventory.quantity,
        })
        .from(inventory)
        .leftJoin(
          warehouseLocations,
          eq(inventory.locationId, warehouseLocations.id)
        )
        .where(
          and(
            eq(inventory.productId, productId),
            eq(inventory.locationId, item.fromLocationId),
            eq(inventory.tenantId, tenantId),
            eq(inventory.status, "available"),
            gt(inventory.quantity, 0)
          )
        );
    }

    // Alocar quantidade necessária
    let remainingQuantity = quantityNeeded;

    for (const inv of inventoryRecords) {
      if (remainingQuantity <= 0) break;

      const allocatedQuantity = Math.min(inv.quantity, remainingQuantity);

      // Determinar se é fracionado
      const isFractional = allocatedQuantity < unitsPerBox;

      allocations.push({
        pickingOrderId,
        productId,
        productSku: product.sku,
        locationId: inv.locationId,
        locationCode: inv.locationCode,
        batch: inv.batch,
        expiryDate: inv.expiryDate ?? null,
        uniqueCode: getUniqueCode(product.sku, inv.batch), // ✅ Adicionar uniqueCode
        labelCode: inv.labelCode, // ✅ Adicionar labelCode
        quantity: allocatedQuantity,
        isFractional,
        sequence: sequence++,
        status: "pending",
        pickedQuantity: 0,
      });

      remainingQuantity -= allocatedQuantity;
    }

    if (remainingQuantity > 0) {
      console.warn(
        `Estoque insuficiente para produto ${product.sku}: faltam ${remainingQuantity} unidades`
      );
    }
  }

  // 4. Ordenar alocações por código de endereço (ordem crescente)
  allocations.sort((a, b) => a.locationCode.localeCompare(b.locationCode));

  // Reatribuir sequence após ordenação
  allocations.forEach((alloc, index) => {
    alloc.sequence = index + 1;
  });

  // 5. Inserir alocações no banco
  if (allocations.length > 0) {
    await db.insert(pickingAllocations).values(allocations);
  }

  // 6. Atualizar status do pedido para "in_progress"
  await db
    .update(pickingOrders)
    .set({ status: "in_progress" })
    .where(eq(pickingOrders.id, pickingOrderId));

  return {
    success: true,
    allocations: allocations.length,
    message: `${allocations.length} alocações criadas com sucesso (${pickingRule})`,
  };
}

/**
 * Busca alocações de um pedido ordenadas por sequence
 */
export async function getPickingAllocations(pickingOrderId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  return await db
    .select()
    .from(pickingAllocations)
    .where(eq(pickingAllocations.pickingOrderId, pickingOrderId))
    .orderBy(pickingAllocations.sequence);
}

/**
 * Agrupa alocações por endereço (para exibição no coletor)
 */
export async function getPickingRoute(pickingOrderId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const allocations = await getPickingAllocations(pickingOrderId);

  // Agrupar por locationCode
  const grouped = allocations.reduce((acc: any, alloc: any) => {
    const key = alloc.locationCode;
    if (!acc[key]) {
      acc[key] = {
        locationId: alloc.locationId,
        locationCode: alloc.locationCode,
        sequence: alloc.sequence,
        items: [],
        hasFractional: false,
      };
    }
    acc[key].items.push(alloc);
    if (alloc.isFractional) {
      acc[key].hasFractional = true;
    }
    return acc;
  }, {});

  // Converter para array e ordenar por sequence
  const route = Object.values(grouped).sort(
    (a: any, b: any) => a.sequence - b.sequence
  );

  return route;
}
