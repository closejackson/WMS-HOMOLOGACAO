/**
 * Módulo de Alertas de Estoque
 * Funções para detectar produtos vencendo, estoque baixo e consultar saldo consolidado
 */

import { getDb } from "./db";
import { inventory, products, warehouseLocations, warehouseZones } from "../drizzle/schema";
import { eq, and, sql, lt, lte, gte } from "drizzle-orm";

/**
 * Busca produtos com validade próxima ao vencimento
 * @param tenantId - ID do tenant
 * @param daysThreshold - Dias até vencimento (padrão: 90)
 * @returns Array de produtos vencendo
 */
export async function getExpiringProducts(tenantId: number, daysThreshold: number = 90) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);

  const results = await db
    .select({
      inventoryId: inventory.id,
      productId: inventory.productId,
      sku: products.sku,
      description: products.description,
      batch: inventory.batch,
      expiryDate: inventory.expiryDate,
      quantity: inventory.quantity,
      locationId: inventory.locationId,
      code: warehouseLocations.code,
      zoneName: warehouseZones.name,
      status: inventory.status,
      daysUntilExpiry: sql<number>`DATEDIFF(${inventory.expiryDate}, NOW())`,
    })
    .from(inventory)
    .innerJoin(products, eq(inventory.productId, products.id))
    .innerJoin(warehouseLocations, eq(inventory.locationId, warehouseLocations.id))
    .leftJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
    .where(
      and(
        eq(inventory.tenantId, tenantId),
        lte(inventory.expiryDate, thresholdDate),
        gte(inventory.expiryDate, new Date()), // Não incluir já vencidos
        eq(inventory.status, "available")
      )
    )
    .orderBy(inventory.expiryDate);

  return results;
}

/**
 * Busca produtos com estoque abaixo do mínimo
 * @param tenantId - ID do tenant
 * @returns Array de produtos com estoque baixo
 */
export async function getLowStockProducts(tenantId: number, minimumThreshold: number = 10) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Agrupa por produto e verifica se está abaixo do limite
  const results = await db
    .select({
      productId: inventory.productId,
      sku: products.sku,
      description: products.description,
      currentStock: sql<number>`SUM(${inventory.quantity})`,
      locationCount: sql<number>`COUNT(DISTINCT ${inventory.locationId})`,
    })
    .from(inventory)
    .innerJoin(products, eq(inventory.productId, products.id))
    .where(
      and(
        eq(inventory.tenantId, tenantId),
        eq(inventory.status, "available")
      )
    )
    .groupBy(inventory.productId, products.sku, products.description)
    .having(sql`SUM(${inventory.quantity}) < ${minimumThreshold}`);

  return results;
}

/**
 * Consulta saldo consolidado de um produto (soma de todas as posições)
 * @param tenantId - ID do tenant
 * @param productId - ID do produto
 * @returns Saldo consolidado por lote e status
 */
export async function getProductStock(tenantId: number, productId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const results = await db
    .select({
      productId: inventory.productId,
      sku: products.sku,
      description: products.description,
      batch: inventory.batch,
      expiryDate: inventory.expiryDate,
      status: inventory.status,
      totalQuantity: sql<number>`SUM(${inventory.quantity})`,
      locationCount: sql<number>`COUNT(DISTINCT ${inventory.locationId})`,
      locations: sql<string>`GROUP_CONCAT(DISTINCT ${warehouseLocations.code} SEPARATOR ', ')`,
    })
    .from(inventory)
    .innerJoin(products, eq(inventory.productId, products.id))
    .innerJoin(warehouseLocations, eq(inventory.locationId, warehouseLocations.id))
    .where(
      and(
        eq(inventory.tenantId, tenantId),
        eq(inventory.productId, productId)
      )
    )
    .groupBy(
      inventory.productId,
      products.sku,
      products.description,
      inventory.batch,
      inventory.expiryDate,
      inventory.status
    )
    .orderBy(inventory.expiryDate);

  // Calcular saldo total disponível
  const totalAvailable = results
    .filter((r: any) => r.status === "available")
    .reduce((sum: number, r: any) => sum + Number(r.totalQuantity), 0);

  const totalQuarantine = results
    .filter((r: any) => r.status === "quarantine")
    .reduce((sum: number, r: any) => sum + Number(r.totalQuantity), 0);

  const totalBlocked = results
    .filter((r: any) => r.status === "blocked")
    .reduce((sum: number, r: any) => sum + Number(r.totalQuantity), 0);

  return {
    productId,
    sku: results[0]?.sku || "",
    description: results[0]?.description || "",
    totalAvailable,
    totalQuarantine,
    totalBlocked,
    totalAll: totalAvailable + totalQuarantine + totalBlocked,
    byBatch: results,
  };
}

/**
 * Consulta saldo consolidado de todos os produtos
 * @param tenantId - ID do tenant
 * @param filters - Filtros opcionais (status, sku)
 * @returns Array de saldos consolidados
 */
export async function getAllProductsStock(
  tenantId: number,
  filters?: { status?: string; sku?: string }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Construir condições de filtro
  const conditions = [eq(inventory.tenantId, tenantId)];
  
  if (filters?.status) {
    conditions.push(eq(inventory.status, filters.status as any));
  }

  if (filters?.sku) {
    conditions.push(sql`${products.sku} LIKE ${`%${filters.sku}%`}`);
  }

  const results = await db
    .select({
      productId: inventory.productId,
      sku: products.sku,
      description: products.description,
      status: inventory.status,
      totalQuantity: sql<number>`SUM(${inventory.quantity})`,
      locationCount: sql<number>`COUNT(DISTINCT ${inventory.locationId})`,
      batchCount: sql<number>`COUNT(DISTINCT ${inventory.batch})`,
    })
    .from(inventory)
    .innerJoin(products, eq(inventory.productId, products.id))
    .where(and(...conditions))
    .groupBy(inventory.productId, products.sku, products.description, inventory.status)
    .orderBy(products.sku);

  return results;
}
