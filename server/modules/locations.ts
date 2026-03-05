/**
 * Funções de banco de dados para gerenciamento de endereços de armazenagem
 */

import { getDb } from "../db";
import { warehouseLocations, warehouseZones, warehouses, tenants, inventory } from "../../drizzle/schema";
import { eq, and, like, or, sql } from "drizzle-orm";

export interface LocationFilters {
  zoneId?: number;
  status?: string;
  locationType?: string;
  search?: string;
  tenantId?: number | null;
}

/**
 * Listar todos os endereços com filtros opcionais
 */
export async function listLocations(filters: LocationFilters = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  let query = db
    .select({
      location: warehouseLocations,
      zone: warehouseZones,
      warehouse: warehouses,
      tenant: tenants,
    })
    .from(warehouseLocations)
    .leftJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
    .leftJoin(warehouses, eq(warehouseZones.warehouseId, warehouses.id))
    .leftJoin(tenants, eq(warehouseLocations.tenantId, tenants.id))
    .$dynamic();
  
  const conditions = [];
  
  if (filters.zoneId) {
    conditions.push(eq(warehouseLocations.zoneId, filters.zoneId));
  }
  
  if (filters.status) {
    conditions.push(eq(warehouseLocations.status, filters.status as any));
  }
  
  if (filters.locationType) {
    conditions.push(eq(warehouseLocations.locationType, filters.locationType as any));
  }
  
  if (filters.search) {
    conditions.push(
      or(
        like(warehouseLocations.code, `%${filters.search}%`),
        like(warehouseLocations.aisle, `%${filters.search}%`),
        like(warehouseLocations.rack, `%${filters.search}%`)
      )!
    );
  }
  
  if (filters.tenantId !== undefined) {
    // Se tenantId for null, buscar endereços compartilhados
    // Se tenantId for um número, buscar endereços do cliente OU compartilhados
    if (filters.tenantId === null) {
      conditions.push(sql`${warehouseLocations.tenantId} IS NULL`);
    } else {
      conditions.push(
        or(
          eq(warehouseLocations.tenantId, filters.tenantId),
          sql`${warehouseLocations.tenantId} IS NULL`
        )!
      );
    }
  }
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }
  
  return await query.orderBy(warehouseLocations.code);
}

/**
 * Buscar endereço por ID
 */
export async function getLocationById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const results = await db
    .select({
      location: warehouseLocations,
      zone: warehouseZones,
      warehouse: warehouses,
      tenant: tenants,
    })
    .from(warehouseLocations)
    .leftJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
    .leftJoin(warehouses, eq(warehouseZones.warehouseId, warehouses.id))
    .leftJoin(tenants, eq(warehouseLocations.tenantId, tenants.id))
    .where(eq(warehouseLocations.id, id))
    .limit(1);
  
  return results[0] || null;
}

/**
 * Buscar endereço por código
 */
export async function getLocationByCode(code: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const results = await db
    .select()
    .from(warehouseLocations)
    .where(eq(warehouseLocations.code, code))
    .limit(1);
  
  return results[0] || null;
}

/**
 * Criar novo endereço
 */
export async function createLocation(data: {
  zoneId: number;
  tenantId: number; // Cliente dono do endereço (OBRIGATÓRIO)
  aisle: string; // Rua (OBRIGATÓRIO)
  rack: string; // Prédio (OBRIGATÓRIO)
  level?: string; // Andar (OPCIONAL)
  position?: string; // Quadrante (OPCIONAL)
  locationType: "whole" | "fraction"; // Inteira ou Fração (OBRIGATÓRIO)
  storageRule: "single" | "multi"; // Regra de armazenagem (OBRIGATÓRIO)
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Validar campos obrigatórios
  if (!data.tenantId) {
    throw new Error("Cliente é obrigatório");
  }
  if (!data.aisle) {
    throw new Error("Rua é obrigatória");
  }
  if (!data.rack) {
    throw new Error("Prédio é obrigatório");
  }
  if (!data.locationType) {
    throw new Error("Tipo é obrigatório");
  }
  if (!data.storageRule) {
    throw new Error("Regra de armazenagem é obrigatória");
  }
  
  // Gerar código automaticamente: RUA-PREDIO-ANDARQUADRANTE
  const codeParts = [data.aisle, data.rack];
  
  // Andar e Quadrante juntos sem separador
  const levelPosition = (data.level || '') + (data.position || '');
  if (levelPosition) codeParts.push(levelPosition);
  
  const code = codeParts.join("-");
  
  const result = await db.insert(warehouseLocations).values({
    zoneId: data.zoneId,
    tenantId: data.tenantId,
    code,
    aisle: data.aisle,
    rack: data.rack,
    level: data.level || null,
    position: data.position || null,
    locationType: data.locationType,
    storageRule: data.storageRule,
    status: "available",
  });
  
  // Buscar e retornar o endereço completo criado
  const locationId = Number(result[0].insertId);
  return await getLocationById(locationId);
}

/**
 * Atualizar endereço
 */
export async function updateLocation(
  id: number,
  data: Partial<{
    zoneId: number;
    tenantId: number | null; // Cliente dono do endereço
    aisle: string; // Rua
    rack: string; // Prédio
    level: string; // Andar
    position: string; // Quadrante
    locationType: "whole" | "fraction"; // Inteira ou Fração
    status: "available" | "occupied" | "blocked" | "counting";
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Regenerar código se algum campo de estrutura foi alterado
  let updateData: any = { ...data };
  if (data.aisle !== undefined || data.rack !== undefined || data.level !== undefined || data.position !== undefined) {
    // Buscar dados atuais
    const current = await db.select().from(warehouseLocations).where(eq(warehouseLocations.id, id)).limit(1);
    if (current.length > 0) {
      const codeParts = [];
      const aisle = data.aisle !== undefined ? data.aisle : current[0].aisle;
      const rack = data.rack !== undefined ? data.rack : current[0].rack;
      const level = data.level !== undefined ? data.level : current[0].level;
      const position = data.position !== undefined ? data.position : current[0].position;
      
      if (aisle) codeParts.push(aisle);
      if (rack) codeParts.push(rack);
      
      // Andar e Quadrante juntos sem separador
      const levelPosition = (level || '') + (position || '');
      if (levelPosition) codeParts.push(levelPosition);
      
      updateData.locationCode = codeParts.join("-") || `LOC-${Date.now()}`;
    }
  }
  
  await db
    .update(warehouseLocations)
    .set(updateData)
    .where(eq(warehouseLocations.id, id));
  
  // Buscar e retornar o endereço completo atualizado
  return await getLocationById(id);
}

/**
 * Deletar endereço
 */
export async function deleteLocation(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .delete(warehouseLocations)
    .where(eq(warehouseLocations.id, id));
  
  return true;
}

/**
 * Listar todas as zonas
 */
export async function listZones() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db
    .select({
      zone: warehouseZones,
      warehouse: warehouses,
    })
    .from(warehouseZones)
    .leftJoin(warehouses, eq(warehouseZones.warehouseId, warehouses.id))
    .where(eq(warehouseZones.status, "active"))
    .orderBy(warehouseZones.name);
}

/**
 * Buscar zona por ID
 */
export async function getZoneById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const results = await db
    .select()
    .from(warehouseZones)
    .where(eq(warehouseZones.id, id))
    .limit(1);
  
  if (results.length === 0) {
    throw new Error(`Zona ${id} não encontrada`);
  }
  
  return results[0];
}

/**
 * Criar nova zona
 */
export async function createZone(data: {
  warehouseId: number;
  zoneCode: string;
  name: string;
  storageCondition: "ambient" | "refrigerated_2_8" | "frozen_minus_20" | "controlled" | "quarantine";
  hasTemperatureControl?: boolean;
  status?: "active" | "inactive";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(warehouseZones).values({
    warehouseId: data.warehouseId,
    code: data.zoneCode, // schema usa 'code', não 'zoneCode'
    name: data.name,
    storageCondition: data.storageCondition,
    hasTemperatureControl: data.hasTemperatureControl || false,
    status: data.status || "active",
  });
  
  return result;
}

/**
 * Atualizar zona
 */
export async function updateZone(id: number, data: Partial<{
  zoneCode: string;
  name: string;
  storageCondition: "ambient" | "refrigerated_2_8" | "frozen_minus_20" | "controlled" | "quarantine";
  hasTemperatureControl: boolean;
  status: "active" | "inactive";
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(warehouseZones)
    .set(data)
    .where(eq(warehouseZones.id, id));
  
  return { success: true };
}

/**
 * Deletar zona
 */
export async function deleteZone(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Verificar se há endereços vinculados
  const locations = await db
    .select()
    .from(warehouseLocations)
    .where(eq(warehouseLocations.zoneId, id));
  
  if (locations.length > 0) {
    throw new Error(`Não é possível deletar zona com ${locations.length} endereço(s) vinculado(s)`);
  }
  
  await db
    .delete(warehouseZones)
    .where(eq(warehouseZones.id, id));
  
  return { success: true };
}

/**
 * Listar todos os armazéns
 */
export async function listWarehouses() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db
    .select()
    .from(warehouses)
    .where(eq(warehouses.status, "active"))
    .orderBy(warehouses.name);
}

/**
 * Obter estatísticas de endereços por zona
 */
export async function getLocationStatsByZone(zoneId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const stats = await db
    .select({
      status: warehouseLocations.status,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(warehouseLocations)
    .where(eq(warehouseLocations.zoneId, zoneId))
    .groupBy(warehouseLocations.status);
  
  return stats;
}

/**
 * Criar endereços em lote
 */
export async function createBulkLocations(data: {
  zoneId: number;
  tenantId: number; // Cliente dono dos endereços (OBRIGATÓRIO)
  aisle: string; // Rua fixa (OBRIGATÓRIO, 1-6 caracteres alfanuméricos)
  rackStart: string; // Prédio inicial (OBRIGATÓRIO, 1-6 caracteres alfanuméricos)
  rackEnd: string; // Prédio final (OBRIGATÓRIO, 1-6 caracteres alfanuméricos)
  levelStart?: string; // Andar inicial (OPCIONAL, 1-6 caracteres alfanuméricos)
  levelEnd?: string; // Andar final (OPCIONAL, 1-6 caracteres alfanuméricos)
  positions?: string[]; // Quadrantes (OPCIONAL)
  locationType: "whole" | "fraction"; // Tipo (OBRIGATÓRIO)
  storageRule: "single" | "multi"; // Regra de armazenagem (OBRIGATÓRIO)
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const locations = [];
  const errors = [];
  
  // Função auxiliar para gerar sequência de valores
  const generateSequence = (start: string, end: string): string[] => {
    // Se valores são iguais, retornar apenas um
    if (start === end) return [start];
    
    // Tentar extrair número do final da string (ex: A201 -> prefixo="A", num=201)
    const startMatch = start.match(/^([A-Z]*)([0-9]+)$/);
    const endMatch = end.match(/^([A-Z]*)([0-9]+)$/);
    
    // Se ambos têm o mesmo padrão (prefixo + número)
    if (startMatch && endMatch && startMatch[1] === endMatch[1]) {
      const prefix = startMatch[1];
      const startNum = parseInt(startMatch[2]);
      const endNum = parseInt(endMatch[2]);
      const padding = startMatch[2].length; // Preservar zeros à esquerda
      
      if (startNum <= endNum) {
        const sequence = [];
        for (let i = startNum; i <= endNum; i++) {
          sequence.push(prefix + i.toString().padStart(padding, '0'));
        }
        return sequence;
      }
    }
    
    // Se não conseguiu gerar sequência, retornar apenas o valor inicial
    return [start];
  };
  
  // Gerar sequências de prédios e andares
  const racks = generateSequence(data.rackStart, data.rackEnd);
  const levels = (data.levelStart && data.levelEnd) ? generateSequence(data.levelStart, data.levelEnd) : [''];
  
  // Gerar todos os endereços (combinação de prédios x andares)
  for (const rack of racks) {
    for (const level of levels) {
      if (data.locationType === "fraction" && data.positions && data.positions.length > 0) {
        // Para tipo fração, criar um endereço para cada quadrante
        for (const position of data.positions) {
          const levelPart = level ? level : '';
          const code = `${data.aisle}-${rack}${levelPart ? '-' + levelPart : ''}${position}`;
          locations.push({
            zoneId: data.zoneId,
            tenantId: data.tenantId,
            code,
            aisle: data.aisle,
            rack,
            level: level || null,
            position,
            locationType: data.locationType,
            storageRule: data.storageRule,
            status: "available" as const,
          });
        }
      } else {
        // Para tipo inteira, criar sem quadrante
        const levelPart = level ? level : '';
        const code = `${data.aisle}-${rack}${levelPart ? '-' + levelPart : ''}`;
        locations.push({
          zoneId: data.zoneId,
          tenantId: data.tenantId,
          code,
          aisle: data.aisle,
          rack,
          level: level || null,
          position: null,
          locationType: data.locationType,
          storageRule: data.storageRule,
          status: "available" as const,
        });
      }
    }
  }
  
  // Verificar códigos duplicados
  const codes = locations.map(l => l.code);
  const existing = await db
    .select({ code: warehouseLocations.code })
    .from(warehouseLocations)
    .where(sql`${warehouseLocations.code} IN (${sql.join(codes.map(c => sql`${c}`), sql`, `)})`);
  
  const existingCodes = new Set(existing.map(e => e.code));
  const toCreate = locations.filter(l => !existingCodes.has(l.code));
  const duplicates = locations.filter(l => existingCodes.has(l.code));
  
  // Inserir em lote
  if (toCreate.length > 0) {
    await db.insert(warehouseLocations).values(toCreate);
  }
  
  return {
    created: toCreate.length,
    duplicates: duplicates.length,
    duplicateCodes: duplicates.map(d => d.code),
    total: locations.length,
  };
}


/**
 * Listar endereços compatíveis com produto/lote específico
 * Regras:
 * - Endereços "whole": só aparecem se vazios OU se já contêm o mesmo produto/lote
 * - Endereços "fraction": sempre aparecem disponíveis
 */
export async function getCompatibleLocations(params: {
  productId: number;
  batch?: string | null;
  tenantId?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Usar inventory já importado no topo do arquivo
  
  // Buscar todos os endereços do tenant (ou compartilhados se tenantId for null)
  const allLocations = await db
    .select({
      location: warehouseLocations,
      zone: warehouseZones,
      warehouse: warehouses,
      tenant: tenants,
    })
    .from(warehouseLocations)
    .leftJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
    .leftJoin(warehouses, eq(warehouseZones.warehouseId, warehouses.id))
    .leftJoin(tenants, eq(warehouseLocations.tenantId, tenants.id))
    .where(
      params.tenantId
        ? or(
            eq(warehouseLocations.tenantId, params.tenantId),
            sql`${warehouseLocations.tenantId} IS NULL`
          )
        : sql`${warehouseLocations.tenantId} IS NULL`
    );
  
  // Filtrar endereços compatíveis
  const compatibleLocations = [];
  
  for (const loc of allLocations) {
    const location = loc.location;
    
    // Endereços "fraction" sempre são compatíveis
    if (location.locationType === "fraction") {
      compatibleLocations.push(loc);
      continue;
    }
    
    // Endereços "whole": verificar se estão vazios ou contêm o mesmo produto/lote
    if (location.locationType === "whole") {
      // Buscar estoque neste endereço
      const stockInLocation = await db
        .select()
        .from(inventory)
        .where(
          and(
            eq(inventory.locationId, location.id),
            eq(inventory.status, "available")
          )
        );
      
      // Se vazio, é compatível
      if (stockInLocation.length === 0) {
        compatibleLocations.push(loc);
        continue;
      }
      
      // Se contém estoque, verificar se é o mesmo produto/lote
      const existingStock = stockInLocation[0];
      const isSameProduct = existingStock.productId === params.productId;
      const isSameBatch = params.batch
        ? existingStock.batch === params.batch
        : true; // Se não informou batch, considera compatível
      
      if (isSameProduct && isSameBatch) {
        compatibleLocations.push(loc);
      }
    }
  }
  
  return compatibleLocations;
}

/**
 * Listar apenas endereços que contêm estoque
 */
export async function listLocationsWithStock(filters: { tenantId?: number | null } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Buscar endereços que têm registros de inventory com quantidade > 0
  const locationsWithStock = await db
    .selectDistinct({
      location: warehouseLocations,
      zone: warehouseZones,
      warehouse: warehouses,
      tenant: tenants,
    })
    .from(warehouseLocations)
    .leftJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
    .leftJoin(warehouses, eq(warehouseZones.warehouseId, warehouses.id))
    .leftJoin(tenants, eq(warehouseLocations.tenantId, tenants.id))
    .innerJoin(inventory, eq(inventory.locationId, warehouseLocations.id))
    .where(
      and(
        sql`${inventory.quantity} > 0`,
        filters.tenantId !== undefined
          ? filters.tenantId === null
            ? sql`${warehouseLocations.tenantId} IS NULL`
            : or(
                eq(warehouseLocations.tenantId, filters.tenantId),
                sql`${warehouseLocations.tenantId} IS NULL`
              )!
          : sql`1=1`
      )
    )
    .orderBy(warehouseLocations.code);
  
  return locationsWithStock;
}


// ============================================================================
// ATUALIZAÇÃO AUTOMÁTICA DE STATUS DE ENDEREÇO
// ============================================================================

/**
 * CORREÇÃO CRÍTICA: Atualiza o status de um endereço baseado no saldo de estoque
 * 
 * Regra: Status de endereço é DERIVADO do estoque, não manual
 * - Se quantity > 0 → status = 'occupied'
 * - Se quantity = 0 → status = 'available'
 * 
 * Esta função deve ser chamada após qualquer operação que altere o estoque:
 * - Recebimento (conference.ts)
 * - Picking (picking.ts)
 * - Movimentação (inventory movements)
 * - Ajuste de inventário
 * 
 * Conformidade: DOCUMENTO_CANONICO_CONTEXTO.md, seções 2.2, 2.3, 3.2
 */
export async function updateLocationStatus(locationId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Calcular saldo total do endereço (soma de todas as posições de estoque)
  const result = await db
    .select({
      totalQuantity: sql<number>`CAST(COALESCE(SUM(${inventory.quantity}), 0) AS SIGNED)`,
    })
    .from(inventory)
    .where(eq(inventory.locationId, locationId));
  
  const totalQuantity = Number(result[0]?.totalQuantity) || 0;
  
  // Determinar novo status baseado em quantidade
  const newStatus = totalQuantity > 0 ? 'occupied' : 'available';
  
  // Atualizar status do endereço
  await db
    .update(warehouseLocations)
    .set({ 
      status: newStatus,
      updatedAt: new Date()
    })
    .where(eq(warehouseLocations.id, locationId));
  
  console.log(`[Location Status] Endereço ${locationId} atualizado: ${newStatus} (quantidade: ${totalQuantity})`);
}
