/**
 * Funções de banco de dados para gerenciamento de produtos
 */

import { getDb } from "../db";
import { products } from "../../drizzle/schema";
import { eq, and, like, or } from "drizzle-orm";

export interface ProductFilters {
  tenantId?: number | null; // Opcional: se null/undefined, admin vê todos os produtos
  status?: string;
  storageCondition?: string;
  isControlledSubstance?: boolean;
  search?: string;
}

/**
 * Listar todos os produtos com filtros opcionais
 */
export async function listProducts(filters: ProductFilters) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  let query = db
    .select()
    .from(products)
    .$dynamic();
  
  const conditions = [];
  
  // Se tenantId for fornecido, filtrar por ele. Caso contrário (admin), mostrar todos
  if (filters.tenantId !== null && filters.tenantId !== undefined) {
    conditions.push(eq(products.tenantId, filters.tenantId));
  }
  
  if (filters.status) {
    conditions.push(eq(products.status, filters.status as any));
  }
  
  if (filters.storageCondition) {
    conditions.push(eq(products.storageCondition, filters.storageCondition as any));
  }
  
  if (filters.isControlledSubstance !== undefined) {
    conditions.push(eq(products.isControlledSubstance, filters.isControlledSubstance));
  }
  
  if (filters.search) {
    conditions.push(
      or(
        like(products.sku, `%${filters.search}%`),
        like(products.description, `%${filters.search}%`),
        like(products.gtin, `%${filters.search}%`)
      )!
    );
  }
  
  query = query.where(and(...conditions));
  
  return await query.orderBy(products.description);
}

/**
 * Buscar produto por ID
 */
export async function getProductById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const results = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  
  return results[0] || null;
}

/**
 * Buscar produto por SKU e tenantId
 */
export async function getProductBySku(tenantId: number, sku: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const results = await db
    .select()
    .from(products)
    .where(and(
      eq(products.tenantId, tenantId),
      eq(products.sku, sku)
    ))
    .limit(1);
  
  return results[0] || null;
}

/**
 * Buscar produto por GTIN
 */
export async function getProductByGtin(tenantId: number, gtin: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const results = await db
    .select()
    .from(products)
    .where(and(
      eq(products.tenantId, tenantId),
      eq(products.gtin, gtin)
    ))
    .limit(1);
  
  return results[0] || null;
}

/**
 * Buscar produto por SKU ou GTIN (para importação de NF-e)
 */
export async function findProductBySkuOrGtin(sku: string, gtin: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Tentar buscar por GTIN primeiro (mais confiável)
  if (gtin) {
    const byGtin = await db
      .select()
      .from(products)
      .where(eq(products.gtin, gtin))
      .limit(1);
    
    if (byGtin[0]) return byGtin[0];
  }
  
  // Se não encontrou por GTIN, buscar por SKU
  const bySku = await db
    .select()
    .from(products)
    .where(eq(products.sku, sku))
    .limit(1);
  
  return bySku[0] || null;
}

/**
 * Criar novo produto
 */
export async function createProduct(data: {
  tenantId: number;
  sku: string;
  description: string;
  gtin?: string;
  anvisaRegistry?: string;
  therapeuticClass?: string;
  manufacturer?: string;
  unitOfMeasure?: string;
  requiresBatchControl?: boolean;
  requiresExpiryControl?: boolean;
  requiresSerialControl?: boolean;
  storageCondition?: "ambient" | "refrigerated_2_8" | "frozen_minus_20" | "controlled";
  minTemperature?: number;
  maxTemperature?: number;
  requiresHumidityControl?: boolean;
  isControlledSubstance?: boolean;
  isPsychotropic?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(products).values({
    tenantId: data.tenantId,
    sku: data.sku,
    description: data.description,
    gtin: data.gtin || null,
    anvisaRegistry: data.anvisaRegistry || null,
    therapeuticClass: data.therapeuticClass || null,
    manufacturer: data.manufacturer || null,
    unitOfMeasure: data.unitOfMeasure || "UN",
    requiresBatchControl: data.requiresBatchControl ?? true,
    requiresExpiryControl: data.requiresExpiryControl ?? true,
    requiresSerialControl: data.requiresSerialControl ?? false,
    storageCondition: data.storageCondition || "ambient",
    minTemperature: data.minTemperature ? String(data.minTemperature) : null,
    maxTemperature: data.maxTemperature ? String(data.maxTemperature) : null,
    requiresHumidityControl: data.requiresHumidityControl ?? false,
    isControlledSubstance: data.isControlledSubstance ?? false,
    isPsychotropic: data.isPsychotropic ?? false,
    status: "active",
  });
  
  // Extrair ID do produto criado
  const insertId = Number((result as any)[0]?.insertId || (result as any).insertId);
  
  if (!insertId) {
    throw new Error("Falha ao obter ID do produto criado");
  }
  
  // Buscar e retornar o produto completo
  const createdProduct = await getProductById(insertId);
  
  if (!createdProduct) {
    throw new Error("Produto criado mas não encontrado no banco");
  }
  
  return createdProduct;
}

/**
 * Atualizar produto
 */
export async function updateProduct(
  id: number,
  data: Partial<{
    sku: string;
    description: string;
    gtin: string;
    anvisaRegistry: string;
    therapeuticClass: string;
    manufacturer: string;
    unitOfMeasure: string;
    requiresBatchControl: boolean;
    requiresExpiryControl: boolean;
    requiresSerialControl: boolean;
    storageCondition: "ambient" | "refrigerated_2_8" | "frozen_minus_20" | "controlled";
    minTemperature: number;
    maxTemperature: number;
    requiresHumidityControl: boolean;
    isControlledSubstance: boolean;
    isPsychotropic: boolean;
    status: "active" | "inactive" | "discontinued";
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Converter temperaturas para string se fornecidas
  const updateData: any = { ...data };
  if (data.minTemperature !== undefined) {
    updateData.minTemperature = String(data.minTemperature);
  }
  if (data.maxTemperature !== undefined) {
    updateData.maxTemperature = String(data.maxTemperature);
  }
  
  await db
    .update(products)
    .set(updateData)
    .where(eq(products.id, id));
  
  return true;
}

/**
 * Deletar produto (soft delete - muda status para discontinued)
 */
export async function deleteProduct(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(products)
    .set({ status: "discontinued" })
    .where(eq(products.id, id));
  
  return true;
}

/**
 * Contar produtos por tenant
 */
export async function countProducts(tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const results = await db
    .select()
    .from(products)
    .where(and(
      eq(products.tenantId, tenantId),
      eq(products.status, "active")
    ));
  
  return results.length;
}
