import { getDb } from "./db";
import { inventory, pickingOrders, pickingOrderItems } from "../drizzle/schema";
import { eq, sql, and, inArray } from "drizzle-orm";

/**
 * Sincroniza reservas de estoque com pedidos ativos
 * 
 * Recalcula `reservedQuantity` em cada registro de estoque baseado na soma
 * de quantidades solicitadas em pedidos ativos (pending, in_progress, separated).
 * 
 * Corrige inconsistências causadas por:
 * - Pedidos finalizados/cancelados que não liberaram reservas
 * - Erros em operações de atualização de estoque
 * - Reservas duplicadas
 * 
 * @returns Relatório com correções aplicadas
 */
export async function syncInventoryReservations() {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const corrections: Array<{
    inventoryId: number;
    productId: number;
    locationId: number;
    tenantId: number;
    oldReserved: number;
    newReserved: number;
    difference: number;
  }> = [];

  try {
    // 1. Buscar todos os registros de estoque
    const allInventory = await db
      .select({
        id: inventory.id,
        productId: inventory.productId,
        locationId: inventory.locationId,
        tenantId: inventory.tenantId,
        quantity: inventory.quantity,
        reservedQuantity: inventory.reservedQuantity,
      })
      .from(inventory);

    console.log(`[syncReservations] Processando ${allInventory.length} registros de estoque...`);

    // 2. Para cada registro de estoque, calcular reservas reais
    for (const inv of allInventory) {
      // Buscar pedidos ativos que reservam este produto/tenant/localização
      // IMPORTANTE: Calcular unidades totais (caixas × unitsPerBox)
      const activeReservations = await db
        .select({
          totalReserved: sql<number>`COALESCE(
            SUM(
              CASE 
                WHEN ${pickingOrderItems.unit} = 'box' 
                THEN ${pickingOrderItems.requestedQuantity} * COALESCE(p.unitsPerBox, 1)
                ELSE ${pickingOrderItems.requestedQuantity}
              END
            ), 0
          )`,
        })
        .from(pickingOrderItems)
        .innerJoin(pickingOrders, eq(pickingOrderItems.pickingOrderId, pickingOrders.id))
        .innerJoin(sql`products p`, sql`${pickingOrderItems.productId} = p.id`)
        .where(
          and(
            eq(pickingOrderItems.productId, inv.productId),
            sql`${pickingOrders.tenantId} = ${inv.tenantId}`,
            // Apenas pedidos ativos reservam estoque
            sql`${pickingOrders.status} IN ('pending', 'in_progress', 'separated', 'in_wave')`
          )
        );

      const correctReservedQty = Number(activeReservations[0]?.totalReserved ?? 0);

      // 3. Se houver diferença, atualizar
      if (correctReservedQty !== inv.reservedQuantity) {
        await db
          .update(inventory)
          .set({ reservedQuantity: correctReservedQty })
          .where(eq(inventory.id, inv.id));

        corrections.push({
          inventoryId: inv.id,
          productId: inv.productId,
          locationId: inv.locationId,
          tenantId: inv.tenantId ?? 0,
          oldReserved: inv.reservedQuantity ?? 0,
          newReserved: correctReservedQty,
          difference: correctReservedQty - (inv.reservedQuantity ?? 0),
        });

        console.log(
          `[syncReservations] Corrigido inventoryId=${inv.id}: ${inv.reservedQuantity} → ${correctReservedQty}`
        );
      }
    }

    console.log(`[syncReservations] Sincronização concluída. ${corrections.length} correções aplicadas.`);

    return {
      success: true,
      totalProcessed: allInventory.length,
      correctionsApplied: corrections.length,
      corrections,
    };
  } catch (error) {
    console.error("[syncReservations] Erro durante sincronização:", error);
    throw error;
  }
}
