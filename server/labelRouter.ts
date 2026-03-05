import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { labelAssociations, inventory, products } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { toMySQLDate } from "../shared/utils";

export const labelRouter = router({
  /**
   * Associar etiqueta não vinculada durante picking (REFATORADO)
   * Cria etiqueta PERMANENTE em labelAssociations (sem sessionId)
   * Vínculo com onda de picking é gerenciado por pickingAllocations
   * 
   * Regra: Etiqueta é um identificador GLOBAL do item físico
   * O estado da tarefa (picking/conferência) é armazenado nas tabelas de vínculo
   */
  associateInPicking: protectedProcedure
    .input(z.object({
      labelCode: z.string(),
      productSku: z.string(),
      batch: z.string().nullable(),
      waveId: z.number(), // ID da onda de picking (usado apenas para log)
    }))
    .mutation(async ({ input, ctx }) => {
      const { labelCode, productSku, batch, waveId } = input;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const tenantId = ctx.user?.tenantId;
      if (!tenantId) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });

      // 1. Verificar se a etiqueta já existe (busca global)
      const existingLabels = await db.select()
        .from(labelAssociations)
        .where(
          and(
            eq(labelAssociations.labelCode, labelCode),
            eq(labelAssociations.tenantId, tenantId)
          )
        )
        .limit(1);
      
      const existingLabel = existingLabels[0];

      if (existingLabel && existingLabel.productId) {
        // Buscar produto para validar
        const productRecords = await db.select()
          .from(products)
          .where(eq(products.id, existingLabel.productId))
          .limit(1);
        
        const product = productRecords[0];
        
        // Verificar se a etiqueta já está vinculada ao produto/lote correto
        const isCorrectProduct = product && product.sku === productSku;
        const isCorrectBatch = !batch || existingLabel.batch === batch;
        
        if (isCorrectProduct && isCorrectBatch) {
          // Etiqueta já vinculada corretamente - retornar sucesso
          console.log(`[PICKING] Etiqueta ${labelCode} já vinculada corretamente ao produto ${productSku} (onda: ${waveId})`);
          return {
            success: true,
            message: "Etiqueta já vinculada corretamente",
            product: {
              id: existingLabel.productId,
              sku: product.sku,
              name: product.description,
            },
            batch: batch,
          };
        } else {
          // Etiqueta vinculada a produto/lote diferente - erro
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Produto incorreto! Esperado SKU: ${productSku}, mas a etiqueta "${labelCode}" está vinculada a outro produto`,
          });
        }
      }

      // 2. Buscar produto pelo SKU
      const productRecords = await db.select()
        .from(products)
        .where(eq(products.sku, productSku))
        .limit(1);
      
      const product = productRecords[0];
      
      if (!product) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Produto ${productSku} não encontrado`,
        });
      }

      // 3. Buscar informações do estoque (se houver lote)
      let expiryDate = null;
      let unitsPerBox = product.unitsPerBox || 1;
      
      if (batch) {
        const inventoryRecords = await db.select({
          expiryDate: inventory.expiryDate,
        })
          .from(inventory)
          .where(
            and(
              eq(inventory.productId, product.id),
              eq(inventory.batch, batch)
            )
          )
          .limit(1);
        
        if (inventoryRecords[0]) {
          expiryDate = inventoryRecords[0].expiryDate;
        }
      }

      // 4. Criar etiqueta PERMANENTE em labelAssociations
      const { getUniqueCode } = await import("./utils/uniqueCode");
      const uniqueCode = getUniqueCode(product.sku, batch);

      await db.insert(labelAssociations).values({
        labelCode: labelCode,
        uniqueCode: uniqueCode,
        productId: product.id,
        batch: batch || "",
        expiryDate: toMySQLDate(expiryDate ? new Date(String(expiryDate)) : null) as any,
        unitsPerBox: unitsPerBox,
        totalUnits: unitsPerBox,
        associatedBy: ctx.user.id,
        tenantId: tenantId,
        associatedAt: new Date(),
        status: 'AVAILABLE' as any,
      });

      console.log(`[PICKING] Etiqueta ${labelCode} criada para produto ${product.sku} (lote: ${batch || 'sem lote'}) - onda: ${waveId}`);

      return {
        success: true,
        message: "Etiqueta associada com sucesso",
        product: {
          id: product.id,
          sku: product.sku,
          name: product.description,
        },
        batch: batch,
      };
    }),
});
