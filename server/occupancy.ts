import { getDb } from "./db";
import { warehouseZones, warehouseLocations, inventory } from "../drizzle/schema";
import { eq, sql, and, isNull } from "drizzle-orm";

export interface ZoneOccupancy {
  zoneId: number;
  zoneName: string;
  total: number;
  occupied: number;
  available: number;
  blocked: number;
  counting: number;
  occupancyPercentage: number;
}

export interface OptimizationSuggestion {
  id: string;
  type: "consolidation" | "capacity_critical" | "reallocation" | "efficiency";
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  impact: string;
  actions: string[];
  metrics: {
    current: number;
    target: number;
    unit: string;
  };
}

/**
 * Calcula ocupação por zona
 */
export async function getOccupancyByZone(): Promise<ZoneOccupancy[]> {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  const zones = await dbConn
    .select({
      zoneId: warehouseZones.id,
      zoneName: warehouseZones.name,
      total: sql<number>`COUNT(DISTINCT ${warehouseLocations.id})`,
      occupied: sql<number>`COUNT(DISTINCT CASE WHEN ${warehouseLocations.status} = 'occupied' THEN ${warehouseLocations.id} END)`,
      available: sql<number>`COUNT(DISTINCT CASE WHEN ${warehouseLocations.status} = 'available' THEN ${warehouseLocations.id} END)`,
      blocked: sql<number>`COUNT(DISTINCT CASE WHEN ${warehouseLocations.status} = 'blocked' THEN ${warehouseLocations.id} END)`,
      counting: sql<number>`COUNT(DISTINCT CASE WHEN ${warehouseLocations.status} = 'counting' THEN ${warehouseLocations.id} END)`,
    })
    .from(warehouseZones)
    .innerJoin(warehouseLocations, eq(warehouseLocations.zoneId, warehouseZones.id))
    .groupBy(warehouseZones.id, warehouseZones.name);

  return zones.map((z) => ({
    ...z,
    occupancyPercentage: z.total > 0 ? (z.occupied / z.total) * 100 : 0,
  }));
}

/**
 * Calcula ocupação geral do armazém
 */
export async function getOverallOccupancy() {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  const result = await dbConn
    .select({
      total: sql<number>`COUNT(DISTINCT ${warehouseLocations.id})`,
      occupied: sql<number>`COUNT(DISTINCT CASE WHEN ${warehouseLocations.status} = 'occupied' THEN ${warehouseLocations.id} END)`,
      available: sql<number>`COUNT(DISTINCT CASE WHEN ${warehouseLocations.status} = 'available' THEN ${warehouseLocations.id} END)`,
      blocked: sql<number>`COUNT(DISTINCT CASE WHEN ${warehouseLocations.status} = 'blocked' THEN ${warehouseLocations.id} END)`,
      counting: sql<number>`COUNT(DISTINCT CASE WHEN ${warehouseLocations.status} = 'counting' THEN ${warehouseLocations.id} END)`,
    })
    .from(warehouseLocations);

  const data = result[0];
  return {
    ...data,
    occupancyPercentage: data.total > 0 ? (data.occupied / data.total) * 100 : 0,
  };
}

/**
 * Gera sugestões de otimização baseadas em padrões de ocupação
 */
export async function getOptimizationSuggestions(): Promise<OptimizationSuggestion[]> {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  const suggestions: OptimizationSuggestion[] = [];
  const zoneOccupancy = await getOccupancyByZone();
  const overall = await getOverallOccupancy();

  // 1. Consolidação - Zonas com <10% ocupação
  const lowOccupancyZones = zoneOccupancy.filter((z) => z.occupancyPercentage < 10 && z.occupied > 0);
  if (lowOccupancyZones.length > 0) {
    suggestions.push({
      id: "consolidation-1",
      type: "consolidation",
      priority: "medium",
      title: "Oportunidade de Consolidação",
      description: `${lowOccupancyZones.length} zona(s) com ocupação abaixo de 10%`,
      impact: "Reduzir custos operacionais e melhorar eficiência de picking",
      actions: [
        "Transferir produtos para zonas com maior ocupação",
        "Liberar zonas subutilizadas para outros clientes",
        "Reduzir área ativa de armazenagem",
      ],
      metrics: {
        current: Math.round(lowOccupancyZones.reduce((sum, z) => sum + z.occupancyPercentage, 0) / lowOccupancyZones.length),
        target: 60,
        unit: "% ocupação média",
      },
    });
  }

  // 2. Capacidade Crítica - Zonas com 80-90% ocupação
  const criticalZones = zoneOccupancy.filter((z) => z.occupancyPercentage >= 80 && z.occupancyPercentage < 95);
  if (criticalZones.length > 0) {
    suggestions.push({
      id: "capacity-critical-1",
      type: "capacity_critical",
      priority: "high",
      title: "Capacidade Crítica",
      description: `${criticalZones.length} zona(s) próxima(s) do limite de capacidade`,
      impact: "Evitar bloqueio de recebimentos e garantir fluxo operacional",
      actions: [
        "Priorizar expedições de produtos dessas zonas",
        "Transferir produtos para zonas com maior disponibilidade",
        "Planejar expansão de capacidade",
      ],
      metrics: {
        current: Math.round(criticalZones.reduce((sum, z) => sum + z.occupancyPercentage, 0) / criticalZones.length),
        target: 75,
        unit: "% ocupação média",
      },
    });
  }

  // 3. Realocação - Produtos fragmentados em >3 endereços
  const fragmentedProducts = await dbConn
    .select({
      productId: inventory.productId,
      locationCount: sql<number>`COUNT(DISTINCT ${inventory.locationId})`,
    })
    .from(inventory)
    .groupBy(inventory.productId)
    .having(sql`COUNT(DISTINCT ${inventory.locationId}) > 3`);

  if (fragmentedProducts.length > 0) {
    suggestions.push({
      id: "reallocation-1",
      type: "reallocation",
      priority: "medium",
      title: "Produtos Fragmentados",
      description: `${fragmentedProducts.length} produto(s) espalhado(s) em múltiplos endereços`,
      impact: "Reduzir tempo de picking e melhorar acuracidade",
      actions: [
        "Consolidar produtos em menos endereços",
        "Aplicar regra FIFO (First In, First Out)",
        "Otimizar roteirização de picking",
      ],
      metrics: {
        current: fragmentedProducts.length,
        target: 0,
        unit: "produtos fragmentados",
      },
    });
  }

  // 4. Eficiência - Baixa utilização geral ou endereços bloqueados
  if (overall.occupancyPercentage < 40) {
    suggestions.push({
      id: "efficiency-1",
      type: "efficiency",
      priority: "low",
      title: "Baixa Utilização Geral",
      description: `Ocupação geral em ${Math.round(overall.occupancyPercentage)}%`,
      impact: "Otimizar custos fixos e melhorar ROI do armazém",
      actions: [
        "Avaliar redução de área operacional",
        "Buscar novos clientes para compartilhamento",
        "Revisar layout e configuração de zonas",
      ],
      metrics: {
        current: Math.round(overall.occupancyPercentage),
        target: 70,
        unit: "% ocupação geral",
      },
    });
  }

  if (overall.blocked > 0) {
    suggestions.push({
      id: "efficiency-2",
      type: "efficiency",
      priority: "high",
      title: "Endereços Bloqueados",
      description: `${overall.blocked} endereço(s) bloqueado(s) indisponível(is)`,
      impact: "Recuperar capacidade de armazenagem",
      actions: [
        "Investigar motivo do bloqueio",
        "Resolver pendências e liberar endereços",
        "Atualizar status no sistema",
      ],
      metrics: {
        current: overall.blocked,
        target: 0,
        unit: "endereços bloqueados",
      },
    });
  }

  return suggestions;
}
