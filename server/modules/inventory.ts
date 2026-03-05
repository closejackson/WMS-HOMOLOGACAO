import { eq, and, or, like, gte, lte, desc, sql, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { getDb } from "../db";
import {
  inventory,
  products,
  warehouseLocations,
  warehouseZones,
  tenants,
} from "../../drizzle/schema";

export interface InventoryFilters {
  tenantId?: number | null;
  productId?: number;
  locationId?: number;
  zoneId?: number;
  batch?: string;
  status?: "available" | "quarantine" | "blocked" | "expired";
  minQuantity?: number;
  search?: string; // Busca por SKU ou descrição do produto
}

export interface InventoryPosition {
  id: number;
  productId: number;
  productSku: string;
  productDescription: string;
  locationId: number;
  code: string;
  locationStatus: string; // Status do endereço (available/occupied)
  zoneName: string;
  batch: string | null;
  expiryDate: Date | null;
  quantity: number;
  status: string; // Status do estoque (available/quarantine/blocked)
  tenantId: number | null;
  tenantName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Consulta posições de estoque com filtros avançados
 */
export async function getInventoryPositions(
  filters: InventoryFilters
): Promise<InventoryPosition[]> {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  const conditions = [];

  if (filters.tenantId !== undefined) {
    if (filters.tenantId === null) {
      conditions.push(isNull(inventory.tenantId));
    } else {
      conditions.push(eq(inventory.tenantId, filters.tenantId));
    }
  }

  if (filters.productId) {
    conditions.push(eq(inventory.productId, filters.productId));
  }

  if (filters.locationId) {
    conditions.push(eq(inventory.locationId, filters.locationId));
  }

  if (filters.zoneId) {
    conditions.push(eq(warehouseLocations.zoneId, filters.zoneId));
  }

  if (filters.batch) {
    conditions.push(like(inventory.batch, `%${filters.batch}%`));
  }

  if (filters.status) {
    conditions.push(eq(inventory.status, filters.status));
  }

  if (filters.minQuantity !== undefined) {
    conditions.push(gte(inventory.quantity, filters.minQuantity));
  }

  // Busca por SKU ou descrição
  if (filters.search) {
    conditions.push(
      sql`(${products.sku} LIKE ${`%${filters.search}%`} OR ${products.description} LIKE ${`%${filters.search}%`})`
    );
  }

  // Criar aliases para distinguir tenant do estoque vs tenant do endereço
  const locationTenant = alias(tenants, 'locationTenant');
  
  const results = await dbConn
    .select({
      id: inventory.id,
      productId: inventory.productId,
      productSku: products.sku,
      productDescription: products.description,
      locationId: inventory.locationId,
      code: warehouseLocations.code,
      locationStatus: warehouseLocations.status, // Status do endereço
      zoneName: warehouseZones.name,
      batch: inventory.batch,
      expiryDate: inventory.expiryDate,
      quantity: inventory.quantity,
      status: inventory.status, // Status do estoque
      tenantId: warehouseLocations.tenantId, // Tenant do endereço
      tenantName: locationTenant.name, // Nome do tenant do endereço
      createdAt: inventory.createdAt,
      updatedAt: inventory.updatedAt,
    })
    .from(inventory)
    .innerJoin(products, eq(inventory.productId, products.id))
    .innerJoin(warehouseLocations, eq(inventory.locationId, warehouseLocations.id))
    .innerJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
    .leftJoin(locationTenant, eq(warehouseLocations.tenantId, locationTenant.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(inventory.updatedAt));

  return results;
}

/**
 * Obter saldo total de um produto (todas as posições)
 */
export async function getProductTotalStock(
  productId: number,
  tenantId?: number | null
): Promise<number> {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  const conditions = [
    eq(inventory.productId, productId),
    eq(inventory.status, "available"),
  ];

  if (tenantId !== undefined) {
    if (tenantId === null) {
      conditions.push(isNull(inventory.tenantId));
    } else {
      conditions.push(eq(inventory.tenantId, tenantId));
    }
  }

  const result = await dbConn
    .select({
      total: sql<number>`CAST(COALESCE(SUM(${inventory.quantity}), 0) AS SIGNED)`,
    })
    .from(inventory)
    .where(and(...conditions));

  return Number(result[0]?.total) || 0;
}

/**
 * Obter saldo de um produto em um endereço específico
 */
export async function getLocationStock(
  productId: number,
  locationId: number,
  batch?: string | null
): Promise<number> {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  const conditions = [
    eq(inventory.productId, productId),
    eq(inventory.locationId, locationId),
    eq(inventory.status, "available"),
  ];

  if (batch) {
    conditions.push(eq(inventory.batch, batch));
  }

  const result = await dbConn
    .select({
      total: sql<number>`CAST(COALESCE(SUM(${inventory.quantity}), 0) AS SIGNED)`,
    })
    .from(inventory)
    .where(and(...conditions));

  return Number(result[0]?.total) || 0;
}

/**
 * Obter produtos com estoque baixo (abaixo do mínimo)
 */
export async function getLowStockProducts(
  tenantId: number,
  threshold: number = 10
): Promise<Array<{
  productId: number;
  productSku: string;
  productDescription: string;
  totalQuantity: number;
}>> {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  const results = await dbConn
    .select({
      productId: inventory.productId,
      productSku: products.sku,
      productDescription: products.description,
      totalQuantity: sql<number>`SUM(${inventory.quantity})`,
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
    .having(sql`SUM(${inventory.quantity}) < ${threshold}`)
    .orderBy(sql`SUM(${inventory.quantity})`);

  return results;
}

/**
 * Obter produtos próximos ao vencimento
 */
export async function getExpiringProducts(
  tenantId: number,
  daysUntilExpiry: number = 30
): Promise<InventoryPosition[]> {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  const expiryThreshold = new Date();
  expiryThreshold.setDate(expiryThreshold.getDate() + daysUntilExpiry);

  // Criar alias para tenant do endereço
  const locationTenant = alias(tenants, 'locationTenant');
  
  const results = await dbConn
    .select({
      id: inventory.id,
      productId: inventory.productId,
      productSku: products.sku,
      productDescription: products.description,
      locationId: inventory.locationId,
      code: warehouseLocations.code,
      locationStatus: warehouseLocations.status,
      zoneName: warehouseZones.name,
      batch: inventory.batch,
      expiryDate: inventory.expiryDate,
      quantity: inventory.quantity,
      status: inventory.status,
      tenantId: warehouseLocations.tenantId,
      tenantName: locationTenant.name,
      createdAt: inventory.createdAt,
      updatedAt: inventory.updatedAt,
    })
    .from(inventory)
    .innerJoin(products, eq(inventory.productId, products.id))
    .innerJoin(warehouseLocations, eq(inventory.locationId, warehouseLocations.id))
    .innerJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
    .leftJoin(locationTenant, eq(warehouseLocations.tenantId, locationTenant.id))
    .where(
      and(
        eq(inventory.tenantId, tenantId),
        eq(inventory.status, "available"),
        lte(inventory.expiryDate, expiryThreshold)
      )
    )
    .orderBy(inventory.expiryDate);

  return results;
}
