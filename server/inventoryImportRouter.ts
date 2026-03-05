/**
 * Router de Importação Massiva de Saldos de Inventário via Excel
 *
 * Regras de negócio:
 * - Acesso restrito a tenantId === 1 (Global Admin / Operador Med@x)
 * - O mesmo labelCode pode existir em múltiplos registros de inventory (sem restrição UNIQUE)
 * - Status derivado automaticamente pela zona do endereço (STORAGE/REC → available; NCG → quarantine)
 * - uniqueCode gerado estritamente como SKU-Lote (sem prefixos ou sufixos)
 * - Transação atômica: erro em qualquer linha cancela toda a importação (rollback)
 */

import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "./db";
import {
  inventory,
  products,
  warehouseLocations,
} from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { toMySQLDate } from "../shared/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Gera uniqueCode estritamente como SKU-Lote (sem sufixos/prefixos) */
function buildUniqueCode(sku: string, batch: string | null | undefined): string {
  if (!batch || batch.trim() === "") return sku.trim();
  return `${sku.trim()}-${batch.trim()}`;
}

/**
 * Deriva o status do registro de inventário com base no código da zona do endereço.
 * Zona NCG → quarantine; qualquer outra zona (STORAGE, REC, EXP, etc.) → available
 */
function deriveStatusFromZone(zoneCode: string | null | undefined): "available" | "quarantine" {
  if (!zoneCode) return "available";
  const zone = zoneCode.toUpperCase().trim();
  if (zone === "NCG") return "quarantine";
  return "available";
}

/**
 * Normaliza um Date para meia-noite no horário LOCAL (startOfDay).
 * Isso evita o "fuso horário fantasma": quando o servidor está em UTC
 * e a data é 2030-12-24 00:00:00 UTC, ao converter para GMT-3 o dia
 * seria 2030-12-23 21:00:00 — resultando em um dia a menos no banco.
 * Usando getFullYear/getMonth/getDate (hora local) e reconstruindo a
 * data com new Date(y, m, d) garantimos meia-noite local.
 */
function startOfDayLocal(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Converte um valor de data do Excel para objeto Date normalizado para
 * meia-noite local (startOfDay). Aceita:
 *   - string "DD/MM/YYYY"
 *   - string "YYYY-MM-DD"
 *   - string "YYYY-MM-DD HH:MM:SS" (exportação MySQL)
 *   - número serial do Excel (dias desde 1900-01-01, com bug de 1900-02-29)
 *   - objeto Date
 *
 * Retorna null se o valor for inválido ou vazio.
 */
function parseExcelDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;

  // ── Número serial do Excel ───────────────────────────────────────────────
  // O Excel armazena datas como dias desde 1899-12-30 (com bug de 1900-02-29).
  // Multiplicamos por ms/dia e somamos ao epoch do Excel para obter um Date UTC.
  // Em seguida normalizamos para meia-noite local para evitar perda de um dia.
  if (typeof value === "number") {
    if (value < 1) return null; // Serial inválido (0 = 1900-01-00)
    const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // 1899-12-30 UTC
    const ms = Math.round(value) * 24 * 60 * 60 * 1000;
    const rawDate = new Date(excelEpoch.getTime() + ms);
    return startOfDayLocal(rawDate);
  }

  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return null;

    // DD/MM/YYYY — construído diretamente como hora local (sem UTC)
    const ddmmyyyy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (ddmmyyyy) {
      return new Date(
        parseInt(ddmmyyyy[3]),
        parseInt(ddmmyyyy[2]) - 1,
        parseInt(ddmmyyyy[1])
      );
    }

    // YYYY-MM-DD — construído diretamente como hora local
    const yyyymmdd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (yyyymmdd) {
      return new Date(
        parseInt(yyyymmdd[1]),
        parseInt(yyyymmdd[2]) - 1,
        parseInt(yyyymmdd[3])
      );
    }

    // YYYY-MM-DD HH:MM:SS (exportação MySQL com hora zerada)
    // Extraímos apenas a parte da data e construímos como hora local
    const yyyymmddHHMMSS = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T]/);
    if (yyyymmddHHMMSS) {
      return new Date(
        parseInt(yyyymmddHHMMSS[1]),
        parseInt(yyyymmddHHMMSS[2]) - 1,
        parseInt(yyyymmddHHMMSS[3])
      );
    }

    // Tentativa genérica — normalizar para meia-noite local
    const d = new Date(s);
    if (!isNaN(d.getTime())) return startOfDayLocal(d);
  }

  // Objeto Date já existente — normalizar para meia-noite local
  if (value instanceof Date) return startOfDayLocal(value);

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema de validação de cada linha do Excel
// ─────────────────────────────────────────────────────────────────────────────

const InventoryRowSchema = z.object({
  /** SKU do produto (obrigatório) */
  sku: z.string().min(1, "SKU é obrigatório"),
  /** Lote (opcional) */
  batch: z.string().optional().nullable(),
  /** Código da etiqueta física (LPN) — pode ser compartilhado entre zonas */
  labelCode: z.string().optional().nullable(),
  /** Código do endereço de destino (obrigatório) */
  locationCode: z.string().min(1, "Endereço é obrigatório"),
  /** Quantidade (obrigatório, > 0) */
  quantity: z.number().int().positive("Quantidade deve ser maior que zero"),
  /** Data de validade (opcional) — aceita string ou número serial */
  expiryDate: z.union([z.string(), z.number(), z.date()]).optional().nullable(),
  /** tenantId do cliente dono do estoque (obrigatório) */
  tenantId: z.number().int().positive("tenantId é obrigatório"),
});

type InventoryRow = z.infer<typeof InventoryRowSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

export const inventoryImportRouter = router({
  /**
   * Importar saldos de inventário em lote via Excel.
   *
   * O cliente envia as linhas já parseadas do Excel como array de objetos.
   * A procedure:
   *   1. Valida que o usuário é do tenantId === 1 (Global Admin)
   *   2. Para cada linha, resolve produto e endereço
   *   3. Deriva status pela zona do endereço
   *   4. Gera uniqueCode como SKU-Lote
   *   5. Insere ou atualiza (upsert) o registro de inventory
   *   6. Tudo dentro de uma transação — erro = rollback total
   */
  importBatch: protectedProcedure
    .input(
      z.object({
        rows: z.array(
          z.object({
            sku: z.string(),
            description: z.string().optional().nullable(),
            batch: z.string().optional().nullable(),
            labelCode: z.string().optional().nullable(),
            locationCode: z.string(),
            quantity: z.number(),
            expiryDate: z.union([z.string(), z.number()]).optional().nullable(),
            tenantId: z.number(),
          })
        ).min(1, "Nenhuma linha fornecida"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // ── 1. Validar acesso: apenas Global Admin (tenantId === 1) ──────────
      if (ctx.user.tenantId !== 1) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Importação de inventário é exclusiva para o operador Med@x (tenantId: 1).",
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const results: {
        inserted: number;
        updated: number;
        productsCreated: number;
        errors: Array<{ linha: number; sku: string; locationCode: string; erro: string }>;
      } = { inserted: 0, updated: 0, productsCreated: 0, errors: [] };

      // ── 2. Pré-carregar produtos e endereços para reduzir queries dentro da transação ──
      const skus = Array.from(new Set(input.rows.map(r => r.sku.trim())));
      const locationCodes = Array.from(new Set(input.rows.map(r => r.locationCode.trim())));

      const [allProducts, allLocations] = await Promise.all([
        db.select({ id: products.id, sku: products.sku, tenantId: products.tenantId })
          .from(products)
          .where(
            skus.length === 1
              ? eq(products.sku, skus[0])
              : (products.sku as any).inArray ? (products.sku as any).inArray(skus) : eq(products.sku, skus[0])
          ),
        db.select({
          id: warehouseLocations.id,
          code: warehouseLocations.code,
          zoneCode: warehouseLocations.zoneCode,
          tenantId: warehouseLocations.tenantId,
        })
          .from(warehouseLocations),
      ]);

      // Buscar todos os produtos por SKU (sem filtro de tenantId pois admin global gerencia todos)
      const allProductsFull = await db
        .select({ id: products.id, sku: products.sku, tenantId: products.tenantId })
        .from(products);

      const productMap = new Map<string, { id: number; sku: string; tenantId: number | null }>();
      for (const p of allProductsFull) {
        productMap.set(p.sku.trim(), p);
      }

      const locationMap = new Map<string, { id: number; code: string; zoneCode: string | null; tenantId: number }>();
      for (const loc of allLocations) {
        locationMap.set(loc.code.trim(), loc);
      }

      // ── 3. Processar dentro de transação atômica ──────────────────────────
      await db.transaction(async (tx) => {
        for (let i = 0; i < input.rows.length; i++) {
          const rawRow = input.rows[i];
          const lineNum = i + 1;

          // Validar linha com Zod
          const parseResult = InventoryRowSchema.safeParse({
            ...rawRow,
            sku: rawRow.sku?.trim(),
            locationCode: rawRow.locationCode?.trim(),
            quantity: typeof rawRow.quantity === "string" ? parseInt(rawRow.quantity) : rawRow.quantity,
          });

          if (!parseResult.success) {
            const msg = parseResult.error.issues.map((e: { message: string }) => e.message).join("; ");
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Linha ${lineNum} (SKU: ${rawRow.sku}, Endereço: ${rawRow.locationCode}): ${msg}`,
            });
          }

          const row: InventoryRow = parseResult.data;

          // Resolver produto — auto-cadastrar se não existir
          let product = productMap.get(row.sku);
          if (!product) {
            // Auto-cadastro: criar produto com SKU + Descrição + tenantId do estoque
            const description = (rawRow as any).description?.trim() || row.sku;
            const insertResult = await tx.insert(products).values({
              tenantId: row.tenantId,
              sku: row.sku,
              description,
              unitOfMeasure: "UN",
              requiresBatchControl: 1 as any,
              requiresExpiryControl: 1 as any,
              requiresSerialControl: 0 as any,
              storageCondition: "ambient",
              minQuantity: 0,
              dispensingQuantity: 1,
            });
            const [newProduct] = await tx
              .select({ id: products.id, sku: products.sku, tenantId: products.tenantId })
              .from(products)
              .where(and(eq(products.sku, row.sku), eq(products.tenantId, row.tenantId)))
              .limit(1);
            if (!newProduct) {
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: `Linha ${lineNum}: Falha ao criar produto com SKU "${row.sku}" automaticamente.`,
              });
            }
            product = newProduct;
            productMap.set(row.sku, newProduct);
            results.productsCreated++;
          }

          // Resolver endereço
          const location = locationMap.get(row.locationCode);
          if (!location) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Linha ${lineNum}: Endereço "${row.locationCode}" não encontrado no cadastro.`,
            });
          }

          // Derivar status pela zona (ignora campo status do Excel)
          const status = deriveStatusFromZone(location.zoneCode);

          // Gerar uniqueCode estritamente como SKU-Lote
          const uniqueCode = buildUniqueCode(row.sku, row.batch);

          // Converter e validar data de validade
          // REGRA: data de validade é obrigatória — item sem validade é erro grave de inventário
          const expiryDateObj = parseExcelDate(row.expiryDate);
          if (!expiryDateObj) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Linha ${lineNum} (SKU: ${row.sku}, Endereço: ${row.locationCode}): Data de validade ausente ou inválida. Um item-lote sem validade é um erro grave de inventário. Verifique se a coluna expiryDate está preenchida e no formato correto (DD/MM/AAAA, AAAA-MM-DD ou número serial do Excel).`,
            });
          }
          const expiryDateStr = toMySQLDate(expiryDateObj);

          // Verificar se já existe registro para este produto+lote+endereço+tenant
          const [existing] = await tx
            .select({ id: inventory.id, quantity: inventory.quantity })
            .from(inventory)
            .where(
              and(
                eq(inventory.productId, product.id),
                eq(inventory.locationId, location.id),
                eq(inventory.tenantId, row.tenantId),
                row.batch
                  ? eq(inventory.batch, row.batch)
                  : (inventory.batch as any).isNull()
              )
            )
            .limit(1);

          if (existing) {
            // ✅ CORREÇÃO: Acumular quantidade (somar) em vez de sobrescrever.
            // O template pode ter múltiplas linhas com o mesmo SKU+Lote+Endereço+Tenant
            // representando lotes físicos distintos que devem ser somados.
            const accumulatedQuantity = existing.quantity + row.quantity;
            await tx
              .update(inventory)
              .set({
                quantity: accumulatedQuantity,
                labelCode: row.labelCode ?? null,
                uniqueCode,
                status,
                locationZone: location.zoneCode ?? null,
                expiryDate: expiryDateStr as any,
                updatedAt: new Date(),
              })
              .where(eq(inventory.id, existing.id));
            results.updated++;
          } else {
            // Inserir novo registro
            await tx.insert(inventory).values({
              tenantId: row.tenantId,
              productId: product.id,
              locationId: location.id,
              batch: row.batch ?? null,
              expiryDate: expiryDateStr as any,
              uniqueCode,
              labelCode: row.labelCode ?? null,
              locationZone: location.zoneCode ?? null,
              quantity: row.quantity,
              reservedQuantity: 0,
              status,
            });
            results.inserted++;
          }
        }
      });

      return {
        success: true,
        inserted: results.inserted,
        updated: results.updated,
        productsCreated: results.productsCreated,
        total: input.rows.length,
        message: `Importação concluída: ${results.inserted} inseridos, ${results.updated} atualizados${
          results.productsCreated > 0 ? `, ${results.productsCreated} produto(s) cadastrado(s) automaticamente` : ""
        }.`,
      };
    }),

  /**
   * Validar linhas do Excel antes da importação (dry-run).
   * Retorna lista de erros por linha sem gravar nada no banco.
   */
  validateBatch: protectedProcedure
    .input(
      z.object({
        rows: z.array(
          z.object({
            sku: z.string(),
            description: z.string().optional().nullable(),
            batch: z.string().optional().nullable(),
            labelCode: z.string().optional().nullable(),
            locationCode: z.string(),
            quantity: z.number(),
            expiryDate: z.union([z.string(), z.number()]).optional().nullable(),
            tenantId: z.number(),
          })
        ).min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Apenas Global Admin pode validar
      if (ctx.user.tenantId !== 1) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Validação de importação é exclusiva para o operador Med@x (tenantId: 1).",
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Pré-carregar produtos e endereços
      const [allProducts, allLocations] = await Promise.all([
        db.select({ id: products.id, sku: products.sku }).from(products),
        db.select({ id: warehouseLocations.id, code: warehouseLocations.code, zoneCode: warehouseLocations.zoneCode })
          .from(warehouseLocations),
      ]);

      const productSkus = new Set(allProducts.map(p => p.sku.trim()));
      const locationCodes = new Set(allLocations.map(l => l.code.trim()));
      const locationZoneMap = new Map(allLocations.map(l => [l.code.trim(), l.zoneCode]));

      const validationErrors: Array<{
        linha: number;
        sku: string;
        locationCode: string;
        erro: string;
        statusDerivado?: string;
        uniqueCode?: string;
      }> = [];

      const validRows: Array<{
        linha: number;
        sku: string;
        batch: string | null;
        labelCode: string | null;
        locationCode: string;
        quantity: number;
        statusDerivado: string;
        uniqueCode: string;
      }> = [];

      for (let i = 0; i < input.rows.length; i++) {
        const rawRow = input.rows[i];
        const lineNum = i + 1;
        const erros: string[] = [];

        if (!rawRow.sku?.trim()) erros.push("SKU é obrigatório");
        if (!rawRow.locationCode?.trim()) erros.push("Endereço é obrigatório");
        if (!rawRow.quantity || rawRow.quantity <= 0) erros.push("Quantidade deve ser maior que zero");
        if (!rawRow.tenantId || rawRow.tenantId <= 0) erros.push("tenantId é obrigatório");

        if (rawRow.sku?.trim() && !productSkus.has(rawRow.sku.trim())) {
          // Produto não encontrado — será criado automaticamente na importação
          // Não é um erro, apenas um aviso informativo
        }
        if (rawRow.locationCode?.trim() && !locationCodes.has(rawRow.locationCode.trim())) {
          erros.push(`Endereço "${rawRow.locationCode}" não encontrado no cadastro`);
        }

        if (erros.length > 0) {
          validationErrors.push({
            linha: lineNum,
            sku: rawRow.sku ?? "",
            locationCode: rawRow.locationCode ?? "",
            erro: erros.join("; "),
          });
        } else {
          const zoneCode = locationZoneMap.get(rawRow.locationCode.trim());
          const statusDerivado = deriveStatusFromZone(zoneCode);
          const uniqueCode = buildUniqueCode(rawRow.sku, rawRow.batch);
          validRows.push({
            linha: lineNum,
            sku: rawRow.sku.trim(),
            batch: rawRow.batch ?? null,
            labelCode: rawRow.labelCode ?? null,
            locationCode: rawRow.locationCode.trim(),
            quantity: rawRow.quantity,
            statusDerivado,
            uniqueCode,
          });
        }
      }

      return {
        valid: validationErrors.length === 0,
        totalRows: input.rows.length,
        validCount: validRows.length,
        errorCount: validationErrors.length,
        errors: validationErrors,
        preview: validRows.slice(0, 20), // Prévia das primeiras 20 linhas válidas
      };
    }),
});
