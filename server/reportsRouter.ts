import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc.js";
import { tenantProcedure, assertSameTenant } from "./_core/tenantGuard";
import { getDb } from "./db.js";
import { 
  inventory, products, tenants, warehouseLocations, warehouseZones, pickingOrders, 
  pickingOrderItems, shipmentManifests, users, inventoryMovements,
  reportLogs, reportFavorites, auditLogs
} from "../drizzle/schema.js";
import { eq, and, gte, lte, desc, asc, sql, or } from "drizzle-orm";

/**
 * Helper: Registra log de geração de relatório
 */
async function logReportGeneration(
  db: any,
  userId: number,
  reportType: string,
  filters: Record<string, any>
) {
  try {
    await db.insert(reportLogs).values({
      userId,
      reportType,
      filters: JSON.stringify(filters),
      generatedAt: new Date(),
    });
  } catch (error) {
    console.error('Erro ao registrar log de relatório:', error);
    // Não falhar a operação se log falhar
  }
}

/**
 * Router de Relatórios
 * 
 * Implementa relatórios gerenciais para o WMS:
 * - Estoque (6 relatórios)
 * - Operacionais (5 relatórios)
 * - Expedição (4 relatórios)
 * - Auditoria (3 relatórios)
 */
export const reportsRouter = router({
  /**
   * ========================================
   * RELATÓRIOS DE ESTOQUE
   * ========================================
   */

  /**
   * 1. Posição de Estoque
   * Visão detalhada do estoque por produto, lote, endereço e cliente
   */
  stockPosition: tenantProcedure
    .input(z.object({
      tenantId: z.number().optional(),
      productId: z.number().optional(),
      batchNumber: z.string().optional(),
      expiryDateStart: z.string().optional(),
      expiryDateEnd: z.string().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(50),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const { tenantId, productId, batchNumber, expiryDateStart, expiryDateEnd, page, pageSize } = input;
      const effectiveTenantId = ctx.isGlobalAdmin ? (tenantId ?? ctx.effectiveTenantId) : ctx.effectiveTenantId;
      const conditions = [];
      if (effectiveTenantId) conditions.push(eq(inventory.tenantId, effectiveTenantId));
      if (productId) conditions.push(eq(inventory.productId, productId));
      if (batchNumber) conditions.push(eq(inventory.batch, batchNumber));
      if (expiryDateStart) conditions.push(gte(inventory.expiryDate, new Date(expiryDateStart)));
      if (expiryDateEnd) conditions.push(lte(inventory.expiryDate, new Date(expiryDateEnd)));
      // Filtrar apenas registros com estoque > 0
      conditions.push(sql`${inventory.quantity} > 0`);
      
      const offset = (page - 1) * pageSize;
      
      const results = await db
        .select({
          id: inventory.id,
          productCode: products.sku,
          productName: products.description,
          batchNumber: inventory.batch,
          expiryDate: inventory.expiryDate,
          quantity: inventory.quantity,
          reserved: inventory.reservedQuantity,
          available: sql<number>`${inventory.quantity} - ${inventory.reservedQuantity}`,
          code: warehouseLocations.code,
          status: inventory.status,
          tenantName: tenants.name,
        })
        .from(inventory)
        .leftJoin(products, eq(inventory.productId, products.id))
        .leftJoin(warehouseLocations, eq(inventory.locationId, warehouseLocations.id))
        .leftJoin(tenants, eq(inventory.tenantId, tenants.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(warehouseLocations.code), asc(products.sku))
        .limit(pageSize)
        .offset(offset);
      
      const [{ total }] = await db
        .select({ total: sql<number>`COUNT(*)` })
        .from(inventory)
        .leftJoin(products, eq(inventory.productId, products.id))
        .leftJoin(warehouseLocations, eq(inventory.locationId, warehouseLocations.id))
        .leftJoin(tenants, eq(inventory.tenantId, tenants.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined);
      
      return { data: results, total, page, pageSize };
    }),

  /**
   * 2. Estoque por Cliente
   * Totalização de estoque agrupado por cliente
   */
  stockByTenant: tenantProcedure
    .input(z.object({
      tenantId: z.number().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(50),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const { tenantId, page, pageSize } = input;
      const effectiveTenantId = ctx.isGlobalAdmin ? (tenantId ?? ctx.effectiveTenantId) : ctx.effectiveTenantId;
      const conditions = [];
      if (effectiveTenantId) conditions.push(eq(inventory.tenantId, effectiveTenantId));
      // Filtrar apenas registros com estoque > 0
      conditions.push(sql`${inventory.quantity} > 0`);
      
      const offset = (page - 1) * pageSize;
      
      const results = await db
        .select({
          tenantId: inventory.tenantId,
          tenantName: tenants.name,
          totalQuantity: sql<number>`SUM(${inventory.quantity})`,
          totalReserved: sql<number>`SUM(${inventory.reservedQuantity})`,
          totalAvailable: sql<number>`SUM(${inventory.quantity} - ${inventory.reservedQuantity})`,
          productCount: sql<number>`COUNT(DISTINCT ${inventory.productId})`,
          locationCount: sql<number>`COUNT(DISTINCT ${inventory.locationId})`,
        })
        .from(inventory)
        .leftJoin(tenants, eq(inventory.tenantId, tenants.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .groupBy(inventory.tenantId, tenants.name)
        .orderBy(desc(sql`SUM(${inventory.quantity})`))
        .limit(pageSize)
        .offset(offset);
      
      return { data: results };
    }),

  /**
   * 3. Estoque por Endereço
   * Ocupação e utilização de endereços de armazenagem
   */
  stockByLocation: tenantProcedure
    .input(z.object({
      tenantId: z.number().optional(),
      locationType: z.enum(['whole', 'fraction']).optional(),
      page: z.number().default(1),
      pageSize: z.number().default(50),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const { tenantId, locationType, page, pageSize } = input;
      const effectiveTenantId = ctx.isGlobalAdmin ? (tenantId ?? ctx.effectiveTenantId) : ctx.effectiveTenantId;
      const conditions = [];
      if (effectiveTenantId) conditions.push(eq(inventory.tenantId, effectiveTenantId));
      if (locationType) conditions.push(eq(warehouseLocations.locationType, locationType));
      // Filtrar apenas registros com estoque > 0 para evitar endereços vazios
      conditions.push(sql`${inventory.quantity} > 0`);
      
      const offset = (page - 1) * pageSize;
      
      const results = await db
        .select({
          locationId: inventory.locationId,
          code: warehouseLocations.code,
          locationType: warehouseLocations.locationType,
          zoneName: warehouseZones.name,
          zoneCode: warehouseZones.code,
          totalQuantity: sql<number>`SUM(${inventory.quantity})`,
          totalReserved: sql<number>`SUM(${inventory.reservedQuantity})`,
          totalAvailable: sql<number>`SUM(${inventory.quantity} - ${inventory.reservedQuantity})`,
          productCount: sql<number>`COUNT(DISTINCT ${inventory.productId})`,
          tenantCount: sql<number>`COUNT(DISTINCT ${inventory.tenantId})`,
        })
        .from(inventory)
        .leftJoin(warehouseLocations, eq(inventory.locationId, warehouseLocations.id))
        .leftJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .groupBy(inventory.locationId, warehouseLocations.code, warehouseLocations.locationType, warehouseZones.name, warehouseZones.code)
        .orderBy(asc(warehouseLocations.code))
        .limit(pageSize)
        .offset(offset);
      
      return { data: results };
    }),

  /**
   * 4. Produtos Próximos ao Vencimento
   * Alerta de produtos com validade próxima (FEFO)
   */
  expiringProducts: tenantProcedure
    .input(z.object({
      tenantId: z.number().optional(),
      daysUntilExpiry: z.number().default(90),
      page: z.number().default(1),
      pageSize: z.number().default(50),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const { tenantId, daysUntilExpiry, page, pageSize } = input;
      const effectiveTenantId = ctx.isGlobalAdmin ? (tenantId ?? ctx.effectiveTenantId) : ctx.effectiveTenantId;
      
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysUntilExpiry);
      
      const conditions = [
        lte(inventory.expiryDate, futureDate),
      ];
      if (effectiveTenantId) conditions.push(eq(inventory.tenantId, effectiveTenantId));
      // Filtrar apenas registros com estoque > 0
      conditions.push(sql`${inventory.quantity} > 0`);
      
      const offset = (page - 1) * pageSize;
      
      const results = await db
        .select({
          productCode: products.sku,
          productName: products.description,
          batchNumber: inventory.batch,
          expiryDate: inventory.expiryDate,
          daysUntilExpiry: sql<number>`DATEDIFF(${inventory.expiryDate}, NOW())`,
          totalQuantity: sql<number>`SUM(${inventory.quantity})`,
          totalReserved: sql<number>`SUM(${inventory.reservedQuantity})`,
          totalAvailable: sql<number>`SUM(${inventory.quantity} - ${inventory.reservedQuantity})`,
          locationCount: sql<number>`COUNT(DISTINCT ${inventory.locationId})`,
          tenantName: tenants.name,
        })
        .from(inventory)
        .leftJoin(products, eq(inventory.productId, products.id))
        .leftJoin(tenants, eq(inventory.tenantId, tenants.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .groupBy(inventory.productId, products.sku, products.description, inventory.batch, inventory.expiryDate, tenants.name)
        .orderBy(asc(inventory.expiryDate))
        .limit(pageSize)
        .offset(offset);
      
      return { data: results };
    }),

  /**
   * 5. Disponibilidade de Produtos
   * Análise de disponibilidade vs reservas
   */
  productAvailability: tenantProcedure
    .input(z.object({
      tenantId: z.number().optional(),
      productId: z.number().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(50),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const { tenantId, productId, page, pageSize } = input;
      const effectiveTenantId = ctx.isGlobalAdmin ? (tenantId ?? ctx.effectiveTenantId) : ctx.effectiveTenantId;
      const conditions = [];
      if (effectiveTenantId) conditions.push(eq(inventory.tenantId, effectiveTenantId));
      if (productId) conditions.push(eq(inventory.productId, productId));
      // Filtrar apenas registros com estoque > 0
      conditions.push(sql`${inventory.quantity} > 0`);
      
      const offset = (page - 1) * pageSize;
      
      const results = await db
        .select({
          productCode: products.sku,
          productName: products.description,
          totalQuantity: sql<number>`SUM(${inventory.quantity})`,
          totalReserved: sql<number>`SUM(${inventory.reservedQuantity})`,
          totalAvailable: sql<number>`SUM(${inventory.quantity} - ${inventory.reservedQuantity})`,
          blockedQuantity: sql<number>`SUM(CASE WHEN ${inventory.status} = 'blocked' THEN ${inventory.quantity} ELSE 0 END)`,
          availablePercentage: sql<number>`ROUND((SUM(${inventory.quantity} - ${inventory.reservedQuantity}) / NULLIF(SUM(${inventory.quantity}), 0)) * 100, 2)`,
          tenantName: tenants.name,
        })
        .from(inventory)
        .leftJoin(products, eq(inventory.productId, products.id))
        .leftJoin(tenants, eq(inventory.tenantId, tenants.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .groupBy(inventory.productId, products.sku, products.description, tenants.name)
        .orderBy(desc(sql`SUM(${inventory.quantity})`))
        .limit(pageSize)
        .offset(offset);
      
      return { data: results };
    }),

  /**
   * 6. Movimentações de Estoque
   * Histórico detalhado de movimentações
   */
  inventoryMovements: tenantProcedure
    .input(z.object({
      tenantId: z.number().optional(),
      productId: z.number().optional(),
      movementType: z.enum(['receiving', 'put_away', 'picking', 'transfer', 'adjustment', 'return', 'disposal', 'quality']).optional(),
      startDate: z.string(),
      endDate: z.string(),
      userId: z.number().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(50),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const { tenantId, productId, movementType, startDate, endDate, userId, page, pageSize } = input;
      const effectiveTenantId = ctx.isGlobalAdmin ? (tenantId ?? ctx.effectiveTenantId) : ctx.effectiveTenantId;
      
      const conditions = [
        gte(inventoryMovements.createdAt, new Date(startDate)),
        lte(inventoryMovements.createdAt, new Date(endDate)),
      ];
      if (effectiveTenantId) conditions.push(eq(inventoryMovements.tenantId, effectiveTenantId));
      if (productId) conditions.push(eq(inventoryMovements.productId, productId));
      if (movementType) conditions.push(eq(inventoryMovements.movementType, movementType));
      if (userId) conditions.push(eq(inventoryMovements.performedBy, userId));
      
      const offset = (page - 1) * pageSize;
      
      const results = await db
        .select({
          id: inventoryMovements.id,
          movementType: inventoryMovements.movementType,
          productCode: products.sku,
          productName: products.description,
          quantity: inventoryMovements.quantity,
          fromLocation: sql<string>`fromLoc.code`,
          toLocation: sql<string>`toLoc.code`,
          notes: inventoryMovements.notes,
          performedBy: users.name,
          createdAt: inventoryMovements.createdAt,
        })
        .from(inventoryMovements)
        .leftJoin(products, eq(inventoryMovements.productId, products.id))
        .leftJoin(sql`${warehouseLocations} AS fromLoc`, sql`${inventoryMovements.fromLocationId} = fromLoc.id`)
        .leftJoin(sql`${warehouseLocations} AS toLoc`, sql`${inventoryMovements.toLocationId} = toLoc.id`)
        .leftJoin(users, eq(inventoryMovements.performedBy, users.id))
        .where(and(...conditions))
        .orderBy(desc(inventoryMovements.createdAt))
        .limit(pageSize)
        .offset(offset);
      
      return { data: results };
    }),

  /**
   * ========================================
   * UTILITÁRIOS
   * ========================================
   */

  /**
   * Salvar filtros favoritos
   */
  saveFavorite: tenantProcedure
    .input(z.object({
      reportType: z.string(),
      favoriteName: z.string(),
      filters: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const result = await db.insert(reportFavorites).values({
        userId: ctx.user.id,
        reportType: input.reportType,
        favoriteName: input.favoriteName,
        filters: JSON.stringify(input.filters),
      });
      
      return { success: true, id: result[0].insertId };
    }),

  /**
   * Listar filtros favoritos do usuário
   */
  listFavorites: tenantProcedure
    .input(z.object({
      reportType: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const conditions = [eq(reportFavorites.userId, ctx.user.id)];
      if (input?.reportType) conditions.push(eq(reportFavorites.reportType, input.reportType));
      
      const results = await db
        .select()
        .from(reportFavorites)
        .where(and(...conditions))
        .orderBy(desc(reportFavorites.createdAt));
      
      return results.map(r => ({
        ...r,
        filters: JSON.parse(r.filters as string),
      }));
    }),

  /**
   * ========================================
   * RELATÓRIOS OPERACIONAIS
   * ========================================
   */

  /**
   * 1. Produtividade de Separação
   * Itens separados por hora, por operador
   */
  pickingProductivity: tenantProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
      operatorId: z.number().optional(),
      tenantId: z.number().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(50),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const { startDate, endDate, operatorId, tenantId, page, pageSize } = input;
      const effectiveTenantId = ctx.isGlobalAdmin ? (tenantId ?? ctx.effectiveTenantId) : ctx.effectiveTenantId;
      
      const conditions = [
        gte(pickingOrders.pickedAt, new Date(startDate)),
        lte(pickingOrders.pickedAt, new Date(endDate)),
      ];
      if (effectiveTenantId) conditions.push(eq(pickingOrders.tenantId, effectiveTenantId));
      if (operatorId) conditions.push(eq(pickingOrders.pickedBy, operatorId));
      
      // Calcular produtividade: total de itens / horas trabalhadas
      const results = await db
        .select({
          operatorId: pickingOrders.pickedBy,
          operatorName: users.name,
          totalOrders: sql<number>`COUNT(DISTINCT ${pickingOrders.id})`,
          totalItems: sql<number>`SUM(${pickingOrderItems.pickedQuantity})`,
          firstPick: sql<Date>`MIN(${pickingOrders.pickedAt})`,
          lastPick: sql<Date>`MAX(${pickingOrders.pickedAt})`,
        })
        .from(pickingOrders)
        .leftJoin(users, eq(pickingOrders.pickedBy, users.id))
        .leftJoin(pickingOrderItems, eq(pickingOrders.id, pickingOrderItems.pickingOrderId))
        .where(and(...conditions))
        .groupBy(pickingOrders.pickedBy, users.name);
      
      const productivity = results.map(r => {
        const hoursWorked = r.firstPick && r.lastPick 
          ? (new Date(r.lastPick).getTime() - new Date(r.firstPick).getTime()) / (1000 * 60 * 60)
          : 0;
        const itemsPerHour = hoursWorked > 0 ? (r.totalItems || 0) / hoursWorked : 0;
        
        return {
          operatorId: r.operatorId,
          operatorName: r.operatorName || 'N/A',
          totalOrders: Number(r.totalOrders) || 0,
          totalItems: Number(r.totalItems) || 0,
          hoursWorked: Math.round(hoursWorked * 100) / 100,
          itemsPerHour: Math.round(itemsPerHour * 100) / 100,
        };
      });
      
      const start = (page - 1) * pageSize;
      const paginatedResults = productivity.slice(start, start + pageSize);
      
      return {
        data: paginatedResults,
        total: productivity.length,
        page,
        pageSize,
      };
    }),

  /**
   * 2. Acuracidade de Picking
   * Divergências vs total de conferências
   */
  pickingAccuracy: tenantProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
      tenantId: z.number().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(50),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const { startDate, endDate, tenantId, page, pageSize } = input;
      const effectiveTenantId = ctx.isGlobalAdmin ? (tenantId ?? ctx.effectiveTenantId) : ctx.effectiveTenantId;
      
      // Buscar conferências de stage no período
      const conditions = [
        gte(sql`DATE(stageChecks.completedAt)`, startDate),
        lte(sql`DATE(stageChecks.completedAt)`, endDate),
      ];
      if (effectiveTenantId) {
        conditions.push(sql`pickingOrders.tenantId = ${effectiveTenantId}`);
      }
      
      const results = await db
        .select({
          date: sql<string>`DATE(stageChecks.completedAt)`,
          totalChecks: sql<number>`COUNT(DISTINCT stageChecks.id)`,
          totalItems: sql<number>`COUNT(stageCheckItems.id)`,
          itemsWithDivergence: sql<number>`SUM(CASE WHEN stageCheckItems.divergence != 0 THEN 1 ELSE 0 END)`,
        })
        .from(sql`stageChecks`)
        .leftJoin(sql`pickingOrders`, sql`stageChecks.pickingOrderId = pickingOrders.id`)
        .leftJoin(sql`stageCheckItems`, sql`stageChecks.id = stageCheckItems.stageCheckId`)
        .where(and(...conditions))
        .groupBy(sql`DATE(stageChecks.completedAt)`);
      
      const accuracy = results.map(r => {
        const accuracyRate = r.totalItems > 0 
          ? ((r.totalItems - r.itemsWithDivergence) / r.totalItems) * 100
          : 100;
        
        return {
          date: r.date,
          totalChecks: Number(r.totalChecks) || 0,
          totalItems: Number(r.totalItems) || 0,
          itemsWithDivergence: Number(r.itemsWithDivergence) || 0,
          accuracyRate: Math.round(accuracyRate * 100) / 100,
        };
      });
      
      const start = (page - 1) * pageSize;
      const paginatedResults = accuracy.slice(start, start + pageSize);
      
      return {
        data: paginatedResults,
        total: accuracy.length,
        page,
        pageSize,
      };
    }),

  /**
   * 3. Tempo Médio de Ciclo
   * Tempo entre criação e finalização de pedidos
   */
  averageCycleTime: tenantProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
      tenantId: z.number().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(50),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const { startDate, endDate, tenantId, page, pageSize } = input;
      const effectiveTenantId = ctx.isGlobalAdmin ? (tenantId ?? ctx.effectiveTenantId) : ctx.effectiveTenantId;
      
      const conditions = [
        gte(pickingOrders.createdAt, new Date(startDate)),
        lte(pickingOrders.createdAt, new Date(endDate)),
        sql`${pickingOrders.pickedAt} IS NOT NULL`,
      ];
      if (effectiveTenantId) conditions.push(eq(pickingOrders.tenantId, effectiveTenantId));
      
      const results = await db
        .select({
          orderNumber: pickingOrders.customerOrderNumber,
          customerName: tenants.name,
          createdAt: pickingOrders.createdAt,
          pickedAt: pickingOrders.pickedAt,
          cycleTimeMinutes: sql<number>`TIMESTAMPDIFF(MINUTE, ${pickingOrders.createdAt}, ${pickingOrders.pickedAt})`,
        })
        .from(pickingOrders)
        .leftJoin(tenants, eq(pickingOrders.tenantId, tenants.id))
        .where(and(...conditions))
        .orderBy(desc(pickingOrders.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      
      const countResult = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(pickingOrders)
        .where(and(...conditions));
      
      return {
        data: results.map(r => ({
          orderNumber: r.orderNumber,
          customerName: r.customerName || 'N/A',
          createdAt: r.createdAt,
          pickedAt: r.pickedAt,
          cycleTimeMinutes: Number(r.cycleTimeMinutes) || 0,
          cycleTimeHours: Math.round((Number(r.cycleTimeMinutes) || 0) / 60 * 100) / 100,
        })),
        total: Number(countResult[0]?.count) || 0,
        page,
        pageSize,
      };
    }),

  /**
   * 4. Pedidos por Status
   * Distribuição de pedidos por status
   */
  ordersByStatus: tenantProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      tenantId: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const { startDate, endDate, tenantId } = input;
      const effectiveTenantId = ctx.isGlobalAdmin ? (tenantId ?? ctx.effectiveTenantId) : ctx.effectiveTenantId;
      
      const conditions = [];
      if (startDate) conditions.push(gte(pickingOrders.createdAt, new Date(startDate)));
      if (endDate) conditions.push(lte(pickingOrders.createdAt, new Date(endDate)));
      if (effectiveTenantId) conditions.push(eq(pickingOrders.tenantId, effectiveTenantId));
      
      const results = await db
        .select({
          status: pickingOrders.status,
          count: sql<number>`COUNT(*)`,
        })
        .from(pickingOrders)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .groupBy(pickingOrders.status);
      
      const statusLabels: Record<string, string> = {
        pending: 'Pendente',
        in_wave: 'Em Onda',
        picked: 'Separado',
        staged: 'Conferido',
        shipped: 'Expedido',
        cancelled: 'Cancelado',
      };
      
      return {
        data: results.map(r => ({
          status: r.status,
          statusLabel: statusLabels[r.status] || r.status,
          count: Number(r.count) || 0,
        })),
      };
    }),

  /**
   * 5. Performance de Operadores
   * Métricas individuais de operadores
   */
  operatorPerformance: tenantProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
      operatorId: z.number().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(50),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const { startDate, endDate, operatorId, page, pageSize } = input;
      
      const conditions = [
        gte(pickingOrders.pickedAt, new Date(startDate)),
        lte(pickingOrders.pickedAt, new Date(endDate)),
      ];
      if (operatorId) conditions.push(eq(pickingOrders.pickedBy, operatorId));
      
      const results = await db
        .select({
          operatorId: pickingOrders.pickedBy,
          operatorName: users.name,
          totalOrders: sql<number>`COUNT(DISTINCT ${pickingOrders.id})`,
          totalItems: sql<number>`SUM(${pickingOrderItems.pickedQuantity})`,
          avgCycleTime: sql<number>`AVG(TIMESTAMPDIFF(MINUTE, ${pickingOrders.createdAt}, ${pickingOrders.pickedAt}))`,
        })
        .from(pickingOrders)
        .leftJoin(users, eq(pickingOrders.pickedBy, users.id))
        .leftJoin(pickingOrderItems, eq(pickingOrders.id, pickingOrderItems.pickingOrderId))
        .where(and(...conditions))
        .groupBy(pickingOrders.pickedBy, users.name);
      
      const performance = results.map(r => ({
        operatorId: r.operatorId,
        operatorName: r.operatorName || 'N/A',
        totalOrders: Number(r.totalOrders) || 0,
        totalItems: Number(r.totalItems) || 0,
        avgCycleTimeMinutes: Math.round(Number(r.avgCycleTime) || 0),
        avgCycleTimeHours: Math.round((Number(r.avgCycleTime) || 0) / 60 * 100) / 100,
      }));
      
      const start = (page - 1) * pageSize;
      const paginatedResults = performance.slice(start, start + pageSize);
      
      return {
        data: paginatedResults,
        total: performance.length,
        page,
        pageSize,
      };
    }),

  /**
   * ========================================
   * FAVORITOS E AUDITORIA
   * ========================================
   */

  /**
   * Adicionar favorito
   */
  addFavorite: tenantProcedure
    .input(z.object({
      id: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      await db
        .delete(reportFavorites)
        .where(and(
          eq(reportFavorites.id, input.id),
          eq(reportFavorites.userId, ctx.user.id)
        ));
      
      return { success: true };
    }),

  /**
   * Registrar geração de relatório (para auditoria)
   */
  logReportGeneration: tenantProcedure
    .input(z.object({
      reportType: z.string(),
      reportCategory: z.enum(['stock', 'operational', 'shipping', 'audit']),
      filters: z.record(z.string(), z.any()),
      exportFormat: z.enum(['screen', 'excel', 'pdf', 'csv']),
      recordCount: z.number(),
      executionTime: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      await db.insert(reportLogs).values({
        tenantId: (ctx as any).effectiveTenantId ?? null,
        userId: ctx.user.id,
        reportType: input.reportType,
        reportCategory: input.reportCategory,
        filters: JSON.stringify(input.filters),
        exportFormat: input.exportFormat,
        recordCount: input.recordCount,
        executionTime: input.executionTime,
      });
      
      return { success: true };
    }),
});
