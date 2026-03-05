import { eq, and, or, gte, lte, gt, inArray, isNull, isNotNull, sql, like } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { getDb } from "./db";
import {
  inventory,
  products,
  warehouseLocations,
  warehouseZones,
  tenants,
  receivingPreallocations,
  
  pickingAllocations,
} from "../drizzle/schema";

export interface InventoryFilters {
  tenantId?: number | null;
  productId?: number;
  locationId?: number;
  zoneId?: number;
  batch?: string;
  status?: "available" | "available" | "occupied" | "blocked" | "counting" | ("available" | "available" | "occupied" | "blocked" | "counting")[];
  minQuantity?: number;
  search?: string;
  locationCode?: string;
}

export interface InventoryPosition {
  id: number;
  productId: number;
  productSku: string;
  productDescription: string;
  locationId: number;
  locationCode: string;
  locationStatus: string;
  locationTenantId: number | null;
  zoneName: string;
  batch: string | null;
  expiryDate: Date | null;
  quantity: number;
  reservedQuantity: number;
  status: string;
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

  const locationConditions = [];
  const inventoryConditions = [];

  // Normalizar status para array
  const statusArray = filters.status 
    ? (Array.isArray(filters.status) ? filters.status : [filters.status])
    : [];

  // Filtro por tenant do endereço
  if (filters.tenantId !== undefined) {
    if (filters.tenantId === null) {
      locationConditions.push(isNull(warehouseLocations.tenantId));
    } else {
      locationConditions.push(eq(warehouseLocations.tenantId, filters.tenantId));
    }
  }

  // Filtro por zona
  if (filters.zoneId) {
    locationConditions.push(eq(warehouseLocations.zoneId, filters.zoneId));
  }

  // Filtro por código de endereço
  if (filters.locationCode) {
    locationConditions.push(like(warehouseLocations.code, `%${filters.locationCode}%`));
  }

  // Filtro por status de endereço
  if (statusArray.length > 0) {
    locationConditions.push(inArray(warehouseLocations.status, statusArray as any));
  }

  // Filtros de inventory (apenas quando há produtos)
  if (filters.productId) {
    inventoryConditions.push(eq(inventory.productId, filters.productId));
  }
  if (filters.locationId) {
    inventoryConditions.push(eq(inventory.locationId, filters.locationId));
  }
  if (filters.minQuantity !== undefined) {
    inventoryConditions.push(gte(inventory.quantity, filters.minQuantity));
  }

  // Filtrar apenas posições com quantidade > 0
  inventoryConditions.push(gt(inventory.quantity, 0));

  // Filtros que devem ser aplicados no WHERE (não no JOIN)
  const whereConditions = [];
  if (filters.batch) {
    whereConditions.push(like(inventory.batch, `%${filters.batch}%`));
  }
  if (filters.search) {
    whereConditions.push(
      sql`(${products.sku} LIKE ${`%${filters.search}%`} OR ${products.description} LIKE ${`%${filters.search}%`})`
    );
  }

  const locationTenant = alias(tenants, "locationTenant");

  // Se filtro inclui "available" OU está vazio (todos os status), usar LEFT JOIN para incluir endereços vazios
  const includeEmpty = statusArray.length === 0 || statusArray.includes("available");

  if (includeEmpty) {
    // LEFT JOIN: inclui endereços sem inventory
    // Quando filtro é APENAS "available", não filtrar por quantidade no JOIN
    const onlyFreeFilter = statusArray.length === 1 && statusArray[0] === "available";
    
    const inventoryJoinConditions = [
      eq(inventory.locationId, warehouseLocations.id),
    ];
    
    // Adicionar filtro de quantidade apenas se não for filtro exclusivo de "available"
    if (!onlyFreeFilter) {
      inventoryJoinConditions.push(gt(inventory.quantity, 0));
      // Adicionar outras condições de inventory
      inventoryJoinConditions.push(
        ...inventoryConditions.filter(c => c.toString() !== gt(inventory.quantity, 0).toString())
      );
    }
    
    const results = await dbConn
      .select({
        // Usar locationId como ID principal para incluir endereços vazios
        id: sql<number>`COALESCE(${inventory.id}, ${warehouseLocations.id})`.as('id'),
        productId: inventory.productId,
        productSku: products.sku,
        productDescription: products.description,
        locationId: warehouseLocations.id,
        locationCode: warehouseLocations.code,
        locationStatus: warehouseLocations.status,
        locationTenantId: warehouseLocations.tenantId,
        zoneName: warehouseZones.name,
        batch: inventory.batch,
        expiryDate: inventory.expiryDate,
        quantity: inventory.quantity,
        reservedQuantity: inventory.reservedQuantity,
        status: inventory.status,
        tenantId: sql`COALESCE(${inventory.tenantId}, ${warehouseLocations.tenantId})`.as('tenantId'),
        tenantName: locationTenant.name,
        createdAt: inventory.createdAt,
        updatedAt: inventory.updatedAt,
      })
      .from(warehouseLocations)
      .innerJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
      .leftJoin(locationTenant, eq(warehouseLocations.tenantId, locationTenant.id))
      .leftJoin(inventory, and(...inventoryJoinConditions))
      .leftJoin(products, eq(inventory.productId, products.id))
      .where(
        and(
          ...(locationConditions.length > 0 ? locationConditions : []),
          ...(whereConditions.length > 0 ? whereConditions : [])
        )
      )
      .orderBy(warehouseLocations.code)
      .limit(1000);

    return results as InventoryPosition[];
  } else {
    // INNER JOIN: apenas endereços com inventory
    const results = await dbConn
      .select({
        id: inventory.id,
        productId: inventory.productId,
        productSku: products.sku,
        productDescription: products.description,
        locationId: inventory.locationId,
        locationCode: warehouseLocations.code,
        locationStatus: warehouseLocations.status,
        locationTenantId: warehouseLocations.tenantId,
        zoneName: warehouseZones.name,
        batch: inventory.batch,
        expiryDate: inventory.expiryDate,
        quantity: inventory.quantity,
        reservedQuantity: inventory.reservedQuantity,
        status: inventory.status,
        tenantId: inventory.tenantId,
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
          ...locationConditions,
          ...inventoryConditions,
          ...(whereConditions.length > 0 ? whereConditions : [])
        )
      )
      .orderBy(warehouseLocations.code, products.sku)
      .limit(1000);

    return results;
  }
}

/**
 * Obtém resumo de estoque (cards de métricas)
 */
export async function getInventorySummary(filters: InventoryFilters) {
  const positions = await getInventoryPositions(filters);

  const totalQuantity = positions.reduce((sum, p) => sum + p.quantity, 0);
  const uniqueLocations = new Set(positions.map((p) => p.locationId)).size;
  const uniqueBatches = new Set(positions.map((p) => p.batch).filter(Boolean)).size;

  return {
    totalPositions: positions.length,
    totalQuantity,
    uniqueLocations,
    uniqueBatches,
  };
}

/**
 * Obtém saldo disponível em um endereço específico
 */
export async function getLocationStock(
  locationId: number,
  productId?: number,
  batch?: string
): Promise<number> {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  const conditions = [eq(inventory.locationId, locationId)];
  if (productId) conditions.push(eq(inventory.productId, productId));
  if (batch) conditions.push(eq(inventory.batch, batch));

  const result = await dbConn
    .select({ total: sql<number>`SUM(${inventory.quantity})` })
    .from(inventory)
    .where(and(...conditions));

  return result[0]?.total ?? 0;
}

/**
 * Obtém produtos com estoque abaixo do mínimo
 */
export async function getLowStockProducts(
  minQuantity: number = 10
): Promise<InventoryPosition[]> {
  return getInventoryPositions({ minQuantity });
}

/**
 * Obtém produtos próximos do vencimento
 */
export async function getExpiringProducts(
  daysThreshold: number = 30
): Promise<InventoryPosition[]> {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysThreshold);

  const locationTenant = alias(tenants, "locationTenant");

  const results = await dbConn
    .select({
      id: inventory.id,
      productId: inventory.productId,
      productSku: products.sku,
      productDescription: products.description,
      locationId: inventory.locationId,
      locationCode: warehouseLocations.code,
      locationStatus: warehouseLocations.status,
      locationTenantId: warehouseLocations.tenantId,
      zoneName: warehouseZones.name,
      batch: inventory.batch,
      expiryDate: inventory.expiryDate,
      quantity: inventory.quantity,
      reservedQuantity: inventory.reservedQuantity,
      status: inventory.status,
      tenantId: inventory.tenantId,
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
        lte(inventory.expiryDate, futureDate),
        gt(inventory.expiryDate, new Date())
      )
    )
    .orderBy(inventory.expiryDate)
    .limit(1000);

  return results as InventoryPosition[];
}

/**
 * Lista endereços que possuem estoque disponível (descontando reservas)
 */
export async function getLocationsWithStock(tenantId?: number | null) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");
  
  // Construir condições WHERE
  let whereConditions = [gt(inventory.quantity, 0)];
  if (tenantId !== undefined && tenantId !== null) {
    whereConditions.push(eq(inventory.tenantId, tenantId));
  }
  
  // Buscar endereços com estoque e calcular saldo disponível
  const results = await dbConn
    .select({
      locationId: inventory.locationId,
      code: warehouseLocations.code,
      zoneName: warehouseZones.name,
      zoneCode: warehouseZones.code,
      totalQuantity: sql<number>`SUM(${inventory.quantity})`,
      reservedQuantity: sql<number>`COALESCE(SUM(${pickingAllocations.quantity}), 0)`,
    })
    .from(inventory)
    .innerJoin(warehouseLocations, eq(inventory.locationId, warehouseLocations.id))
    .innerJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
    .leftJoin(pickingAllocations, eq(pickingAllocations.locationId, inventory.locationId))
    .where(and(...whereConditions))
    .groupBy(
      inventory.locationId,
      warehouseLocations.id,
      warehouseLocations.code,
      warehouseZones.name,
      warehouseZones.code
    )
    .orderBy(warehouseLocations.code);
  
  // Filtrar apenas endereços com saldo disponível > 0
  const locationsWithAvailableStock = results
    .filter(loc => (loc.totalQuantity - loc.reservedQuantity) > 0)
    .map(loc => ({
      id: loc.locationId,
      code: loc.code,
      zoneName: loc.zoneName,
      zoneCode: loc.zoneCode,
    }));
  
  return locationsWithAvailableStock;
}

export async function getDestinationLocations(params: {
  movementType: string;
  productId?: number;
  batch?: string;
  tenantId?: number | null;
}) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  const { movementType, productId, batch, tenantId } = params;

  // Para TRANSFERÊNCIA: filtrar por regras de armazenagem
  if (movementType === "transfer") {
    // Buscar todos os endereços (vazios E ocupados) do tenant selecionado
    // Endereços ocupados podem ser destino se contiverem o mesmo item-lote
    const allLocations = await dbConn
      .select({
        id: warehouseLocations.id,
        code: warehouseLocations.code,
        storageRule: warehouseLocations.storageRule,
        zoneName: warehouseZones.name,
        zoneCode: warehouseZones.code,
      })
      .from(warehouseLocations)
      .innerJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
      .where(
        tenantId !== undefined && tenantId !== null
          ? eq(warehouseLocations.tenantId, tenantId)
          : sql`1=1`
      )
      .orderBy(warehouseLocations.code);

    // Buscar estoque atual de cada endereço (filtrado por tenant se fornecido)
    const locationStocks = await dbConn
      .select({
        locationId: inventory.locationId,
        productId: inventory.productId,
        batch: inventory.batch,
        quantity: inventory.quantity,
      })
      .from(inventory)
      .where(
        tenantId !== undefined && tenantId !== null
          ? and(
              gt(inventory.quantity, 0),
              eq(inventory.tenantId, tenantId)
            )
          : gt(inventory.quantity, 0)
      );

    // Criar mapa de estoque por endereço
    const stockMap = new Map<number, Array<{ productId: number; batch: string | null }>>();
    for (const stock of locationStocks) {
      if (!stockMap.has(stock.locationId)) {
        stockMap.set(stock.locationId, []);
      }
      stockMap.get(stock.locationId)!.push({
        productId: stock.productId,
        batch: stock.batch,
      });
    }

    // Filtrar endereços válidos
    const validLocations = allLocations.filter((loc) => {
      const stocks = stockMap.get(loc.id) || [];
      
      if (loc.storageRule === "single") {
        // Regra ÚNICO: aceita vazios ou ocupados pelo mesmo item-lote
        if (stocks.length === 0) return true; // Vazio
        if (stocks.length === 1 && stocks[0].productId === productId && stocks[0].batch === batch) {
          return true; // Mesmo item-lote
        }
        return false;
      } else {
        // Regra MULTI: aceita vazios ou ocupados por diferentes SKUs
        if (stocks.length === 0) return true; // Vazio
        // Verifica se já tem outros produtos (multi-SKU)
        const uniqueProducts = new Set(stocks.map(s => s.productId));
        return uniqueProducts.size >= 1; // Aceita se já tem produtos
      }
    });

    return validLocations;
  }

  // Para DEVOLUÇÃO: filtrar por zona "DEV" do cliente
  if (movementType === "return") {
    const results = await dbConn
      .select({
        id: warehouseLocations.id,
        code: warehouseLocations.code,
        storageRule: warehouseLocations.storageRule,
        zoneName: warehouseZones.name,
        zoneCode: warehouseZones.code,
      })
      .from(warehouseLocations)
      .innerJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
      .where(
        tenantId !== undefined && tenantId !== null
          ? and(
              eq(warehouseLocations.status, "available"),
              eq(warehouseZones.code, "DEV"),
              eq(warehouseLocations.tenantId, tenantId)
            )
          : and(
              eq(warehouseLocations.status, "available"),
              eq(warehouseZones.code, "DEV")
            )
      )
      .orderBy(warehouseLocations.code);

    return results;
  }

  // Para QUALIDADE: filtrar por zona "NCG" do cliente
  if (movementType === "quality") {
    const results = await dbConn
      .select({
        id: warehouseLocations.id,
        code: warehouseLocations.code,
        storageRule: warehouseLocations.storageRule,
        zoneName: warehouseZones.name,
        zoneCode: warehouseZones.code,
      })
      .from(warehouseLocations)
      .innerJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
      .where(
        tenantId !== undefined && tenantId !== null
          ? and(
              eq(warehouseLocations.status, "available"),
              eq(warehouseZones.code, "NCG"),
              eq(warehouseLocations.tenantId, tenantId)
            )
          : and(
              eq(warehouseLocations.status, "available"),
              eq(warehouseZones.code, "NCG")
            )
      )
      .orderBy(warehouseLocations.code);

    return results;
  }

  // Para AJUSTE e DESCARTE: retornar todos os endereços com estoque
  const results = await dbConn
    .selectDistinct({
      id: warehouseLocations.id,
      code: warehouseLocations.code,
      storageRule: warehouseLocations.storageRule,
      zoneName: warehouseZones.name,
      zoneCode: warehouseZones.code,
    })
    .from(inventory)
    .innerJoin(warehouseLocations, eq(inventory.locationId, warehouseLocations.id))
    .innerJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
    .where(gt(inventory.quantity, 0))
    .orderBy(warehouseLocations.code);

  return results;
}

/**
 * Sugere endereço de destino baseado em pré-alocação
 * Usado quando movimentação origina da zona REC
 */
export async function getSuggestedDestination(params: {
  fromLocationId: number;
  productId: number;
  batch: string | null;
  quantity: number;
}) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  // 1. Verificar se endereço origem é da zona REC
  const fromLocation = await dbConn
    .select({
      zoneCode: warehouseZones.code,
    })
    .from(warehouseLocations)
    .leftJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
    .where(eq(warehouseLocations.id, params.fromLocationId))
    .limit(1);

  if (!fromLocation[0] || fromLocation[0].zoneCode !== "REC") {
    return null; // Não é zona REC, não há sugestão
  }

  // 2. Buscar pré-alocação correspondente
  const preallocation = await dbConn
    .select({
      locationId: receivingPreallocations.locationId,
      code: warehouseLocations.code,
      zoneName: warehouseZones.name,
      quantity: receivingPreallocations.quantity,
    })
    .from(receivingPreallocations)
    .innerJoin(warehouseLocations, eq(receivingPreallocations.locationId, warehouseLocations.id))
    .leftJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
    .where(
      and(
        eq(receivingPreallocations.productId, params.productId),
        params.batch 
          ? eq(receivingPreallocations.batch, params.batch)
          : sql`${receivingPreallocations.batch} IS NULL`,
        eq(receivingPreallocations.quantity, params.quantity),
        eq(receivingPreallocations.status, "pending")
      )
    )
    .limit(1);

  if (!preallocation[0]) {
    return null; // Não há pré-alocação correspondente
  }

  return {
    locationId: preallocation[0].locationId,
    locationCode: preallocation[0].code,
    zoneName: preallocation[0].zoneName,
    quantity: preallocation[0].quantity,
  };
}
