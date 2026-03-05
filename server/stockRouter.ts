import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { warehouseLocations, products, inventory, labelAssociations } from "../drizzle/schema";
import { getDb } from "./db";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { tenantProcedure, assertSameTenant } from "./_core/tenantGuard";
import {
  getInventoryPositions,
  getInventorySummary,
  getLocationStock,
  getLowStockProducts,
  getExpiringProducts,
  getLocationsWithStock,
  getDestinationLocations,
  getSuggestedDestination,
} from "./inventory";
import {
  registerMovement,
  getMovementHistory,
  getLocationProducts,
} from "./movements";
import {
  getOccupancyByZone,
  getOverallOccupancy,
  getOptimizationSuggestions,
} from "./occupancy";

// Schema de validação para filtros de estoque
const inventoryFiltersSchema = z.object({
  tenantId: z.number().optional().nullable(),
  productId: z.number().optional(),
  locationId: z.number().optional(),
  zoneId: z.number().optional(),
  batch: z.string().optional(),
  status: z.union([
    z.enum(["available", "available", "occupied", "blocked", "counting"]),
    z.array(z.enum(["available", "available", "occupied", "blocked", "counting"]))
  ]).optional(),
  minQuantity: z.number().optional(),
  search: z.string().optional(),
  locationCode: z.string().optional(),
});

// Schema de validação para movimentação
const registerMovementSchema = z.object({
  productId: z.number(),
  fromLocationId: z.number(),
  toLocationId: z.number().optional(), // Opcional para descarte
  quantity: z.number().positive(),
  batch: z.string().optional(),
  movementType: z.enum(["transfer", "adjustment", "return", "disposal", "quality"]),
  notes: z.string().optional(),
  tenantId: z.number().optional().nullable(),
  /** Quando true, indica que um admin autenticou a liberação de itens blocked/quarantine */
  adminReleaseAuthorized: z.boolean().optional(),
});

// Schema de validação para histórico de movimentações
const movementHistorySchema = z.object({
  productId: z.number().optional(),
  locationId: z.number().optional(),
  movementType: z.string().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  limit: z.number().optional(),
});

export const stockRouter = router({
  // ============================================================================
  // CONSULTAS DE ESTOQUE
  // ============================================================================

  /**
   * Obtém posições de estoque com filtros avançados
   */
  getPositions: tenantProcedure
    .input(inventoryFiltersSchema)
    .query(async ({ input, ctx }) => {
      const { effectiveTenantId, isGlobalAdmin } = ctx;
      // Não-admins sempre filtram pelo próprio tenant
      const tenantId = isGlobalAdmin ? (input.tenantId ?? effectiveTenantId) : effectiveTenantId;
      return await getInventoryPositions({ ...input, tenantId });
    }),

  /**
   * Obtém resumo de estoque (cards de métricas)
   */
  getSummary: tenantProcedure
    .input(inventoryFiltersSchema)
    .query(async ({ input, ctx }) => {
      const { effectiveTenantId, isGlobalAdmin } = ctx;
      const tenantId = isGlobalAdmin ? (input.tenantId ?? effectiveTenantId) : effectiveTenantId;
      return await getInventorySummary({ ...input, tenantId });
    }),

  /**
   * Obtém saldo disponível em um endereço
   */
  getLocationStock: tenantProcedure
    .input(
      z.object({
        locationId: z.number(),
        productId: z.number().optional(),
        batch: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      return await getLocationStock(
        input.locationId,
        input.productId,
        input.batch
      );
    }),

  /**
   * Obtém produtos com estoque abaixo do mínimo
   */
  getLowStock: tenantProcedure
    .input(z.object({ minQuantity: z.number().optional() }))
    .query(async ({ input }) => {
      return await getLowStockProducts(input.minQuantity);
    }),

  /**
   * Obtém produtos próximos do vencimento
   */
  getExpiring: tenantProcedure
    .input(z.object({ daysThreshold: z.number().optional() }))
    .query(async ({ input }) => {
      return await getExpiringProducts(input.daysThreshold);
    }),

  // ============================================================================
  // MOVIMENTAÇÕES DE ESTOQUE
  // ============================================================================

  /**
   * Registra movimentação de estoque
   */
  registerMovement: tenantProcedure
    .input(registerMovementSchema)
    .mutation(async ({ input, ctx }) => {
      const { effectiveTenantId, isGlobalAdmin } = ctx;
      // Validar que o tenantId do input pertence ao tenant do usuário
      if (input.tenantId) {
        assertSameTenant(input.tenantId, effectiveTenantId, isGlobalAdmin, "movimentação de estoque");
      }
      // Para Global Admin: se input.tenantId foi fornecido, usar esse valor.
      // Se não foi fornecido, passar null para que a query de inventory
      // não filtre por tenantId (o Global Admin pode mover estoque de qualquer tenant).
      // Para usuários normais: usar effectiveTenantId (nunca null).
      const resolvedTenantId = isGlobalAdmin
        ? (input.tenantId ?? null)
        : effectiveTenantId;
      return await registerMovement({
        ...input,
        tenantId: resolvedTenantId,
        performedBy: ctx.user.id,
      });
    }),

  /**
   * Obtém histórico de movimentações
   */
  getMovements: tenantProcedure
    .input(movementHistorySchema)
    .query(async ({ input }) => {
      return await getMovementHistory(input);
    }),

  /**
   * Obtém produtos disponíveis em um endereço
   */
  getLocationProducts: tenantProcedure
    .input(z.object({ 
      locationId: z.number(),
      tenantId: z.number().optional().nullable(),
    }))
    .query(async ({ input, ctx }) => {
      const { effectiveTenantId, isGlobalAdmin } = ctx;
      const tenantId = isGlobalAdmin ? (input.tenantId ?? effectiveTenantId) : effectiveTenantId;
      return await getLocationProducts(input.locationId, tenantId);
    }),

  /**
   * Lista endereços que possuem estoque alocado
   */
  getLocationsWithStock: tenantProcedure
    .input(z.object({ 
      tenantId: z.number().optional().nullable(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const { effectiveTenantId, isGlobalAdmin } = ctx;
      const tenantId = isGlobalAdmin ? (input?.tenantId ?? effectiveTenantId) : effectiveTenantId;
      return await getLocationsWithStock(tenantId);
    }),

  /**
   * Lista endereços de destino válidos baseado no tipo de movimentação
   */
  getDestinationLocations: tenantProcedure
    .input(z.object({
      movementType: z.enum(["transfer", "adjustment", "return", "disposal", "quality"]),
      productId: z.number().optional(),
      batch: z.string().optional(),
      tenantId: z.number().optional().nullable(),
    }))
    .query(async ({ input }) => {
      return await getDestinationLocations(input);
    }),

  /**
   * Sugere endereço de destino baseado em pré-alocação (zona REC)
   */
  getSuggestedDestination: tenantProcedure
    .input(z.object({
      fromLocationId: z.number(),
      productId: z.number(),
      batch: z.string().nullable(),
      quantity: z.number(),
    }))
    .query(async ({ input }) => {
      return await getSuggestedDestination(input);
    }),

  // ============================================================================
  // DASHBOARD DE OCUPAÇÃO
  // ============================================================================

  /**
   * Obtém ocupação por zona
   */
  getOccupancyByZone: tenantProcedure.query(async () => {
    return await getOccupancyByZone();
  }),

  /**
   * Obtém ocupação geral do armazém
   */
  getOverallOccupancy: tenantProcedure.query(async () => {
    return await getOverallOccupancy();
  }),

  /**
   * Obtém sugestões de otimização
   */
  getOptimizationSuggestions: tenantProcedure.query(async () => {
    return await getOptimizationSuggestions();
  }),

  // ============================================================================
  // EXPORTAÇÃO
  // ============================================================================

  /**
   * Exporta estoque para Excel
   */
  exportToExcel: tenantProcedure
    .input(inventoryFiltersSchema)
    .mutation(async ({ input, ctx }) => {
      const { effectiveTenantId, isGlobalAdmin } = ctx;
      const tenantId = isGlobalAdmin ? (input.tenantId ?? effectiveTenantId) : effectiveTenantId;
      input = { ...input, tenantId };
      const ExcelJS = (await import('exceljs')).default;
      const positions = await getInventoryPositions(input);
      
      // Criar workbook e worksheet
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Estoque');
      
      // Definir colunas
      worksheet.columns = [
        { header: 'SKU', key: 'sku', width: 15 },
        { header: 'Produto', key: 'product', width: 40 },
        { header: 'Lote', key: 'batch', width: 15 },
        { header: 'Quantidade', key: 'quantity', width: 12 },
        { header: 'Unidade', key: 'unit', width: 10 },
        { header: 'Endereço', key: 'location', width: 15 },
        { header: 'Zona', key: 'zone', width: 10 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Validade', key: 'expiry', width: 12 },
      ];
      
      // Estilizar cabeçalho
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      };
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      
      // Adicionar dados
      positions.forEach((pos: any) => {
        worksheet.addRow({
          sku: pos.productSku,
          product: pos.productDescription,
          batch: pos.batch || 'N/A',
          quantity: pos.quantity,
          unit: 'UN',
          location: pos.locationCode,
          zone: pos.zoneName || 'N/A',
          status: pos.status === 'available' ? 'Disponível' : 
                  pos.status === 'quarantine' ? 'Quarentena/NCG' :
                  pos.status === 'blocked' ? 'Bloqueado' : 'Expirado',
          expiry: pos.expiryDate ? new Date(pos.expiryDate).toLocaleDateString('pt-BR') : 'N/A',
        });
      });
      
      // Gerar buffer
      const buffer = await workbook.xlsx.writeBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      
      return {
        success: true,
        filename: `estoque_${new Date().toISOString().split('T')[0]}.xlsx`,
        data: base64,
      };
    }),

  /**
   * Busca endereço por código
   */
  getLocationByCode: tenantProcedure
    .input(z.object({ code: z.string() }))
    .query(async ({ input }) => {
      const dbConn = await getDb();
      if (!dbConn) throw new Error("Database connection failed");

      const location = await dbConn
        .select({
          id: warehouseLocations.id,
          code: warehouseLocations.code,
          tenantId: warehouseLocations.tenantId,
          status: warehouseLocations.status,
        })
        .from(warehouseLocations)
        .where(eq(warehouseLocations.code, input.code))
        .limit(1);

      if (!location[0]) {
        throw new Error(`Endereço ${input.code} não encontrado`);
      }

      return location[0];
    }),

  /**
   * Busca produto por código de etiqueta e retorna dados do estoque no endereço de origem
   */
  getProductByCode: tenantProcedure
    .input(z.object({ 
      code: z.string(),
      locationCode: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const dbConn = await getDb();
      if (!dbConn) throw new Error("Database connection failed");

      // Primeiro, tentar buscar por código de etiqueta (labelAssociations)
      const labelAssoc = await dbConn
        .select({
          productId: labelAssociations.productId,
          batch: labelAssociations.batch,
          expiryDate: labelAssociations.expiryDate,
          unitsPerBox: labelAssociations.unitsPerBox,
        })
        .from(labelAssociations)
        .where(eq(labelAssociations.labelCode, input.code))
        .limit(1);

      let productId: number;
      let labelBatch: string | null = null;
      let labelUnitsPerBox: number | null = null;

      if (labelAssoc[0]) {
        // Etiqueta encontrada - usar productId da associação
        productId = labelAssoc[0].productId;
        labelBatch = labelAssoc[0].batch || null;
        labelUnitsPerBox = labelAssoc[0].unitsPerBox;
      } else {
        // Etiqueta não encontrada — sem labelAssociation para esse código

        // Etiqueta não existe - tentar buscar diretamente por SKU (fallback)
        const productBySku = await dbConn
          .select({ id: products.id })
          .from(products)
          .where(eq(products.sku, input.code))
          .limit(1);

        if (!productBySku[0]) {
          throw new Error(`Etiqueta ou produto ${input.code} não encontrado`);
        }

        productId = productBySku[0].id;
      }

      // Buscar dados do produto
      const product = await dbConn
        .select({
          id: products.id,
          sku: products.sku,
          description: products.description,
          unitsPerBox: products.unitsPerBox,
        })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      if (!product[0]) {
        throw new Error(`Produto não encontrado`);
      }

      // Se locationCode fornecido, buscar dados do estoque nesse endereço
      let stockData = null;
      if (input.locationCode) {
        const location = await dbConn
          .select({ id: warehouseLocations.id })
          .from(warehouseLocations)
          .where(eq(warehouseLocations.code, input.locationCode))
          .limit(1);

        if (location[0]) {
          const stock = await dbConn
            .select({
              batch: inventory.batch,
              quantity: inventory.quantity,
              reservedQuantity: inventory.reservedQuantity,
              expiryDate: inventory.expiryDate,
            })
            .from(inventory)
            .where(
              and(
                eq(inventory.productId, product[0].id),
                eq(inventory.locationId, location[0].id),
                // ✅ CORREÇÃO DE ESCOPO: Filtrar apenas saldo 'available' para não retornar
                // registros quarantine do mesmo endereço (ex: zona REC com saldo NCG)
                eq(inventory.status, 'available')
              )
            )
            .limit(1);

          if (stock[0]) {
            stockData = stock[0];
          }
        }
      }

      // Priorizar unitsPerBox da etiqueta, depois do produto
      const finalUnitsPerBox = labelUnitsPerBox || product[0].unitsPerBox || 1;

      // Priorizar batch da etiqueta, depois do estoque
      const finalBatch = labelBatch || stockData?.batch || null;

      const availableQuantity = stockData 
        ? (stockData.quantity - (stockData.reservedQuantity ?? 0))
        : 0;

      return {
        ...product[0],
        unitsPerBox: finalUnitsPerBox,
        batch: finalBatch,
        availableQuantity,
        expiryDate: stockData?.expiryDate || null,
      };
    }),
});
