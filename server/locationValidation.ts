/**
 * Validação de regras de endereçamento
 * Garante que apenas zonas especiais (DEV, NCG, REC, EXP) aceitem múltiplos lotes do mesmo SKU
 */

import { getDb } from "./db";
import { inventory, warehouseLocations, warehouseZones } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

/**
 * Zonas que permitem múltiplos lotes do mesmo SKU em um endereço
 */
const MULTI_BATCH_ZONES = ["DEV", "NCG", "REC", "EXP"];

/**
 * Valida se um endereço pode receber um produto+lote
 * 
 * Regras:
 * 1. Zonas DEV, NCG, REC, EXP: SEMPRE permitem múltiplos lotes do mesmo SKU
 * 2. Outras zonas: Verificar se já existe outro lote do mesmo SKU no endereço
 * 
 * @param locationId - ID do endereço destino
 * @param productId - ID do produto
 * @param batch - Lote do produto (pode ser null)
 * @returns { allowed: boolean, reason?: string }
 */
export async function validateLocationForBatch(
  locationId: number,
  productId: number,
  batch: string | null
): Promise<{ allowed: boolean; reason?: string }> {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  // Buscar informações do endereço e zona
  const location = await dbConn
    .select({
      locationId: warehouseLocations.id,
      code: warehouseLocations.code,
      zoneId: warehouseLocations.zoneId,
      zoneCode: warehouseZones.code,
      zoneName: warehouseZones.name,
    })
    .from(warehouseLocations)
    .leftJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
    .where(eq(warehouseLocations.id, locationId))
    .limit(1);

  if (location.length === 0) {
    return {
      allowed: false,
      reason: `Endereço ${locationId} não encontrado`,
    };
  }

  const { zoneCode, code: locationCode } = location[0];

  // Verificar se zona permite múltiplos lotes
  if (zoneCode && MULTI_BATCH_ZONES.includes(zoneCode.toUpperCase())) {
    // Zonas especiais sempre permitem múltiplos lotes
    return { allowed: true };
  }

  // Para outras zonas, verificar se já existe outro lote do mesmo produto no endereço
  const existingBatches = await dbConn
    .select({
      batch: inventory.batch,
      quantity: inventory.quantity,
    })
    .from(inventory)
    .where(
      and(
        eq(inventory.locationId, locationId),
        eq(inventory.productId, productId)
      )
    );

  // Se não há estoque no endereço, permitir
  if (existingBatches.length === 0) {
    return { allowed: true };
  }

  // Se há estoque, verificar se é do mesmo lote
  const hasDifferentBatch = existingBatches.some(
    (existing) => existing.batch !== batch && existing.quantity > 0
  );

  if (hasDifferentBatch) {
    const existingBatchList = existingBatches
      .filter((b) => b.batch !== batch && b.quantity > 0)
      .map((b) => b.batch || "SEM LOTE")
      .join(", ");

    return {
      allowed: false,
      reason: `Endereço ${locationCode} já possui outro lote do mesmo produto (${existingBatchList}). Apenas zonas ${MULTI_BATCH_ZONES.join(", ")} permitem múltiplos lotes do mesmo SKU.`,
    };
  }

  // Mesmo lote ou sem lote conflitante, permitir
  return { allowed: true };
}
