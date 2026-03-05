import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import {
  processPreallocationExcel,
  validatePreallocations,
  savePreallocations,
  getPreallocations,
  deletePreallocations,
} from "./preallocation";

export const preallocationRouter = router({
  /**
   * Processa arquivo Excel de pré-alocação e retorna validações
   */
  processFile: protectedProcedure
    .input(
      z.object({
        receivingOrderId: z.number(),
        fileBase64: z.string(), // Arquivo em base64
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Decodificar base64
      const fileBuffer = Buffer.from(input.fileBase64, "base64");

      // Processar Excel
      const rows = await processPreallocationExcel(fileBuffer);

      // Validar contra banco de dados
      const validations = await validatePreallocations(
        rows,
        input.receivingOrderId,
        (ctx as any).effectiveTenantId
      );

      const validCount = validations.filter((v) => v.isValid).length;
      const invalidCount = validations.length - validCount;

      return {
        totalRows: validations.length,
        validRows: validCount,
        invalidRows: invalidCount,
        validations,
      };
    }),

  /**
   * Salva pré-alocações válidas no banco de dados
   */
  save: protectedProcedure
    .input(
      z.object({
        receivingOrderId: z.number(),
        validations: z.array(
          z.object({
            isValid: z.boolean(),
            row: z.number(),
            endereco: z.string(),
            codInterno: z.string(),
            lote: z.string(),
            quantidade: z.number(),
            errors: z.array(z.string()),
            locationId: z.number().optional(),
            productId: z.number().optional(),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const savedCount = await savePreallocations(
        input.receivingOrderId,
        input.validations,
        ctx.user.id
      );

      return {
        savedCount,
      };
    }),

  /**
   * Lista pré-alocações de uma ordem de recebimento
   */
  list: protectedProcedure
    .input(
      z.object({
        receivingOrderId: z.number(),
      })
    )
    .query(async ({ input }) => {
      return await getPreallocations(input.receivingOrderId);
    }),

  /**
   * Deleta pré-alocações de uma ordem de recebimento
   */
  delete: protectedProcedure
    .input(
      z.object({
        receivingOrderId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      await deletePreallocations(input.receivingOrderId);
      return { success: true };
    }),

  /**
   * Executa endereçamento: move estoque de REC para endereços finais
   * e registra movimentações de entrada
   */
  execute: protectedProcedure
    .input(
      z.object({
        receivingOrderId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { executeAddressing } = await import("./preallocation");
      return await executeAddressing(
        input.receivingOrderId,
        ctx.user.id
      );
    }),
});
