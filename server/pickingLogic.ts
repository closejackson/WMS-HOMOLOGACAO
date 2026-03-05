/**
 * Lógica de Picking Automático (FIFO/FEFO) e Dirigido
 * Implementa as regras de seleção de endereços e lotes conforme configuração do cliente
 */

import { getDb } from "./db";
import { inventory, warehouseLocations, products, tenants, pickingAuditLogs } from "../drizzle/schema";
import { eq, and, gte, sql, desc, asc } from "drizzle-orm";

/**
 * Tipo de regra de picking
 */
export type PickingRule = "FIFO" | "FEFO" | "Direcionado";

/**
 * Resultado da sugestão de picking
 */
export interface PickingSuggestion {
  locationId: number;
  locationCode: string;
  productId: number;
  batch: string;
  expiryDate: Date | null;
  receivedDate: Date;
  availableQuantity: number;
  rule: PickingRule;
  priority: number; // Ordem de prioridade (1 = primeiro a ser separado)
}

/**
 * Parâmetros para sugestão de picking
 */
export interface PickingSuggestionParams {
  tenantId: number;
  productId: number;
  requestedQuantity: number;
  rule?: PickingRule; // Se não informado, busca do cliente
}

/**
 * Busca a regra de picking do cliente
 */
export async function getClientPickingRule(tenantId: number): Promise<PickingRule> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const tenant = await db
    .select({ pickingRule: tenants.pickingRule })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant || tenant.length === 0) {
    throw new Error("Cliente não encontrado");
  }

  return tenant[0].pickingRule as PickingRule;
}

/**
 * Sugere endereços e lotes para picking baseado na regra do cliente
 * Retorna lista ordenada por prioridade (FIFO/FEFO)
 */
export async function suggestPickingLocations(
  params: PickingSuggestionParams
): Promise<PickingSuggestion[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Busca regra do cliente se não informada
  const rule = params.rule || (await getClientPickingRule(params.tenantId));

  // Busca estoque disponível do produto
  const stockQuery = db
    .select({
      locationId: inventory.locationId,
      code: warehouseLocations.code,
      productId: inventory.productId,
      batch: inventory.batch,
      expiryDate: inventory.expiryDate,
      receivedDate: inventory.createdAt,
      availableQuantity: sql<number>`(${inventory.quantity} - ${inventory.reservedQuantity})`.as('availableQuantity'),
    })
    .from(inventory)
    .innerJoin(warehouseLocations, eq(inventory.locationId, warehouseLocations.id))
    .where(
      and(
        eq(inventory.productId, params.productId),
        eq(inventory.tenantId, params.tenantId),
        eq(inventory.status, "available"), // Apenas estoque disponível
        sql`(${inventory.quantity} - ${inventory.reservedQuantity}) > 0` // Saldo livre > 0 (desconta reservas)
      )
    );

  // Aplica ordenação baseada na regra
  let orderedStock;
  if (rule === "FIFO") {
    // FIFO: Data de entrada mais antiga primeiro
    orderedStock = await stockQuery.orderBy(asc(inventory.createdAt));
  } else if (rule === "FEFO") {
    // FEFO: Data de validade mais próxima primeiro.
    // Produtos sem validade (NULL) ficam por ÚLTIMO — MySQL ordena NULLs antes por padrão com ASC,
    // por isso usamos CASE para empurrá-los ao final.
    orderedStock = await stockQuery.orderBy(
      sql`CASE WHEN ${inventory.expiryDate} IS NULL THEN 1 ELSE 0 END ASC`,
      asc(inventory.expiryDate)
    );
  } else {
    // Direcionado: sem ordenação automática (cliente define manualmente)
    orderedStock = await stockQuery;
  }

  // Mapeia resultados com prioridade
  const suggestions: PickingSuggestion[] = orderedStock.map((item: any, index: number) => ({
    locationId: item.locationId,
    locationCode: item.locationCode,
    productId: item.productId,
    batch: item.batch,
    expiryDate: item.expiryDate,
    receivedDate: item.receivedDate,
    availableQuantity: item.availableQuantity,
    rule,
    priority: index + 1, // Prioridade sequencial
  }));

  return suggestions;
}

/**
 * Aloca estoque para picking seguindo a regra do cliente
 * Retorna lista de alocações (pode dividir entre múltiplos endereços/lotes)
 */
export interface PickingAllocation {
  locationId: number;
  locationCode: string;
  batch: string;
  expiryDate: Date | null;
  allocatedQuantity: number;
  priority: number;
}

export async function allocatePickingStock(
  params: PickingSuggestionParams
): Promise<PickingAllocation[]> {
  const suggestions = await suggestPickingLocations(params);

  if (suggestions.length === 0) {
    throw new Error("Nenhum estoque disponível para o produto solicitado");
  }

  const allocations: PickingAllocation[] = [];
  let remainingQuantity = params.requestedQuantity;

  // Aloca estoque seguindo a ordem de prioridade
  for (const suggestion of suggestions) {
    if (remainingQuantity <= 0) break;

    const allocatedQty = Math.min(suggestion.availableQuantity, remainingQuantity);

    allocations.push({
      locationId: suggestion.locationId,
      locationCode: suggestion.locationCode,
      batch: suggestion.batch,
      expiryDate: suggestion.expiryDate,
      allocatedQuantity: allocatedQty,
      priority: suggestion.priority,
    });

    remainingQuantity -= allocatedQty;
  }

  // Verifica se conseguiu alocar toda a quantidade
  if (remainingQuantity > 0) {
    throw new Error(
      `Estoque insuficiente. Solicitado: ${params.requestedQuantity}, Disponível: ${
        params.requestedQuantity - remainingQuantity
      }`
    );
  }

  return allocations;
}

/**
 * Valida se picking direcionado está permitido
 * Retorna erro se cliente não tem regra "Direcionado" configurada
 */
export async function validateDirectedPicking(
  tenantId: number,
  locationId: number,
  batch: string
): Promise<{ valid: boolean; message?: string }> {
  const rule = await getClientPickingRule(tenantId);

  if (rule !== "Direcionado") {
    return {
      valid: false,
      message: `Cliente configurado com regra ${rule}. Picking direcionado não permitido.`,
    };
  }

  // Valida se lote existe no endereço
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const stock = await db
    .select({ quantity: inventory.quantity })
    .from(inventory)
    .where(
      and(
        eq(inventory.tenantId, tenantId),
        eq(inventory.locationId, locationId),
        eq(inventory.batch, batch),
        eq(inventory.status, "available")
      )
    )
    .limit(1);

  if (!stock || stock.length === 0 || stock[0].quantity <= 0) {
    return {
      valid: false,
      message: "Lote não encontrado ou sem saldo disponível no endereço especificado",
    };
  }

  return { valid: true };
}

/**
 * Registra log de auditoria de picking
 */
export interface PickingAuditLog {
  pickingOrderId: number;
  tenantId: number;
  rule: PickingRule;
  productId: number;
  requestedQuantity: number;
  allocations: PickingAllocation[];
  timestamp: Date;
  userId: string;
}

export async function logPickingAudit(log: PickingAuditLog): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(pickingAuditLogs).values({
    pickingOrderId: log.pickingOrderId,
    tenantId: log.tenantId,
    pickingRule: log.rule,
    productId: log.productId,
    requestedQuantity: log.requestedQuantity,
    allocatedLocations: log.allocations as any,
    userId: parseInt(log.userId),
  });

  console.log("[PICKING AUDIT]", {
    orderId: log.pickingOrderId,
    rule: log.rule,
    product: log.productId,
    qty: log.requestedQuantity,
    allocations: log.allocations.length,
    user: log.userId,
    timestamp: log.timestamp.toISOString(),
  });
}
