import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { tenantProcedure, assertSameTenant } from "./_core/tenantGuard";
import {
  getOrderForStage,
  startStageCheck,
  recordStageItem,
  completeStageCheck,
  getActiveStageCheck,
  getStageCheckHistory,
} from "./stage";

/**
 * Router para o módulo de Stage (Conferência de Expedição)
 * Permite conferência cega de pedidos antes da expedição
 */
export const stageRouter = {
  /**
   * Busca pedido por customerOrderNumber para iniciar conferência
   * Apenas pedidos com status 'completed' podem ser conferidos
   */
  getOrderForStage: tenantProcedure
    .input(z.object({
      customerOrderNumber: z.string(),
      tenantId: z.number().optional(), // Global Admin pode filtrar por tenant
    }))
    .query(async ({ input, ctx }) => {
      // Global Admin sem tenantId específico: sem filtro (null = ver todos)
      const tenantId = ctx.isGlobalAdmin
        ? (input.tenantId ?? null)
        : ctx.effectiveTenantId;
      return await getOrderForStage(input.customerOrderNumber, tenantId);
    }),

  /**
   * Inicia conferência de Stage para um pedido
   * Cria registro de stageCheck e retorna itens (sem quantidades esperadas)
   */
  startStageCheck: tenantProcedure
    .input(z.object({
      pickingOrderId: z.number(),
      customerOrderNumber: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Para startStageCheck, sempre usa o tenantId do pedido (via pickingOrderId)
      // Passa null para Global Admin sem tenant selecionado
      const tenantId = ctx.isGlobalAdmin ? null : ctx.effectiveTenantId;
      return await startStageCheck({
        pickingOrderId: input.pickingOrderId,
        customerOrderNumber: input.customerOrderNumber,
        operatorId: ctx.user.id,
        operatorName: ctx.user.name || ctx.user.email || `Usuário #${ctx.user.id}`,
        tenantId,
      });
    }),

  /**
   * Registra item conferido (produto bipado + quantidade informada)
   */
  recordStageItem: tenantProcedure
    .input(z.object({
      stageCheckId: z.number(),
      labelCode: z.string(),
      quantity: z.number().positive().optional(),
      autoIncrement: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return await recordStageItem({
        stageCheckId: input.stageCheckId,
        labelCode: input.labelCode,
        quantity: input.quantity,
        autoIncrement: input.autoIncrement,
        tenantId: ctx.effectiveTenantId,
      });
    }),

  /**
   * Finaliza conferência de Stage
   * Valida divergências, baixa estoque e atualiza status do pedido
   */
  completeStageCheck: tenantProcedure
    .input(z.object({
      stageCheckId: z.number(),
      notes: z.string().optional(),
      force: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return await completeStageCheck({
        stageCheckId: input.stageCheckId,
        notes: input.notes,
        force: input.force,
        tenantId: ctx.effectiveTenantId,
      });
    }),

  /**
   * Busca conferência ativa (in_progress) do operador
   */
  getActiveStageCheck: tenantProcedure
    .query(async ({ ctx }) => {
      // Global Admin sem tenant selecionado: ver todas as conferências ativas
      const tenantId = ctx.isGlobalAdmin ? null : ctx.effectiveTenantId;
      return await getActiveStageCheck(ctx.user.id, tenantId);
    }),

  /**
   * Lista histórico de conferências de Stage
   */
  getStageCheckHistory: tenantProcedure
    .input(z.object({
      limit: z.number().default(50),
      offset: z.number().default(0),
      tenantId: z.number().optional(), // Global Admin pode filtrar por tenant
    }))
    .query(async ({ input, ctx }) => {
      // Global Admin sem tenant selecionado: ver histórico de todos os tenants
      const tenantId = ctx.isGlobalAdmin ? (input.tenantId ?? null) : ctx.effectiveTenantId;
      return await getStageCheckHistory({
        tenantId,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  /**
   * Gera etiquetas de volumes em PDF
   * Retorna PDF em base64 para impressão automática
   */
  generateVolumeLabels: tenantProcedure
    .input(z.object({
      customerOrderNumber: z.string(),
      customerName: z.string(),
      tenantName: z.string(),
      totalVolumes: z.number().min(1),
    }))
    .mutation(async ({ input }) => {
      const { generateVolumeLabels } = await import("./volumeLabels");
      
      const labels = Array.from({ length: input.totalVolumes }, (_, i) => ({
        customerOrderNumber: input.customerOrderNumber,
        customerName: input.customerName,
        tenantName: input.tenantName,
        volumeNumber: i + 1,
        totalVolumes: input.totalVolumes,
      }));

      const pdfBuffer = await generateVolumeLabels(labels);
      
      return {
        success: true,
        pdfBase64: pdfBuffer.toString("base64"),
        filename: `etiquetas-${input.customerOrderNumber}.pdf`,
      };
    }),

  /**
   * Desfazer última bipagem no stage (LIFO)
   * Decrementa checkedQuantity do item identificado pelo stageCheckItemId
   */
  undoLastStageItem: tenantProcedure
    .input(z.object({
      stageCheckId: z.number(),
      stageCheckItemId: z.number(),
      quantityToUndo: z.number().min(1).default(1),
    }))
    .mutation(async ({ input }) => {
      const { getDb } = await import("./db");
      const { stageCheckItems } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [item] = await db
        .select()
        .from(stageCheckItems)
        .where(eq(stageCheckItems.id, input.stageCheckItemId))
        .limit(1);

      if (!item || item.stageCheckId !== input.stageCheckId) {
        throw new Error("Item de conferência não encontrado");
      }
      if (item.checkedQuantity <= 0) {
        throw new Error("Nenhuma bipagem para desfazer neste item");
      }

      const qty = Math.min(input.quantityToUndo, item.checkedQuantity);
      const newChecked = item.checkedQuantity - qty;
      const newDivergence = newChecked - item.expectedQuantity;

       await db.update(stageCheckItems)
        .set({
          checkedQuantity: newChecked,
          divergence: newDivergence,
        })
        .where(eq(stageCheckItems.id, item.id));
      // Buscar nome do produto para retornar ao frontend
      const { products } = await import("../drizzle/schema");
      const [prod] = await db
        .select({ description: products.description })
        .from(products)
        .where(eq(products.id, item.productId))
        .limit(1);
      return {
        ok: true,
        quantityReverted: qty,
        newCheckedQuantity: newChecked,
        newRemainingQuantity: item.expectedQuantity - newChecked,
        productName: prod?.description ?? "",
        message: `Última bipagem desfeita (${qty} un.)`,
      };
    }),

  /**
   * Heartbeat: atualiza lastActivityAt para manter o lock ativo
   */
  stageHeartbeat: tenantProcedure
    .input(z.object({ stageCheckId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const { getDb } = await import("./db");
      const { stageChecks } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.update(stageChecks)
        .set({ lastActivityAt: new Date() })
        .where(
          and(
            eq(stageChecks.id, input.stageCheckId),
            eq(stageChecks.lockedByUserId, ctx.user.id)
          )
        );
      return { ok: true };
    }),

  /**
   * Libera o lock voluntariamente (saída do usuário)
   */
  releaseStageLock: tenantProcedure
    .input(z.object({ stageCheckId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const { getDb } = await import("./db");
      const { stageChecks } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.update(stageChecks)
        .set({ lockedByUserId: null, lockedByName: null })
        .where(
          and(
            eq(stageChecks.id, input.stageCheckId),
            eq(stageChecks.lockedByUserId, ctx.user.id)
          )
        );
      return { ok: true };
    }),

  /**
   * Força liberação do lock (apenas Global Admin)
   */
  forceReleaseStageLock: tenantProcedure
    .input(z.object({ stageCheckId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.isGlobalAdmin) {
        const { TRPCError } = await import("@trpc/server");
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o administrador global pode forçar a liberação." });
      }
      const { getDb } = await import("./db");
      const { stageChecks } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.update(stageChecks)
        .set({ lockedByUserId: null, lockedByName: null })
        .where(eq(stageChecks.id, input.stageCheckId));
      return { ok: true, message: "Lock liberado pelo administrador." };
    }),

  /**
   * Cancela conferência de Stage em andamento
   * Deleta registros de stageCheck e stageCheckItems
   */
  cancelStageCheck: tenantProcedure
    .input(z.object({
      stageCheckId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { cancelStageCheck } = await import("./stage");
      // Global Admin: sem filtro de tenant (null = acesso irrestrito)
      const tenantId = ctx.isGlobalAdmin ? null : ctx.effectiveTenantId;
      return await cancelStageCheck({
        stageCheckId: input.stageCheckId,
        tenantId,
      });
    }),
};
