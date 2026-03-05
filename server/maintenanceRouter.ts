/**
 * Router de Manutenção e Jobs Automáticos
 *
 * Endpoints para executar tarefas de manutenção do sistema,
 * como sincronização de reservas, limpeza de dados órfãos, etc.
 */

import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { syncInventoryReservations } from "./syncReservations";

/**
 * Tabelas disponíveis para limpeza pelo Admin Global (tenantId === 1).
 * Cada entrada define o nome da tabela SQL e uma descrição legível.
 * ATENÇÃO: truncate é irreversível. Tabelas de configuração (users, products,
 * locations, tenants) são intencionalmente excluídas desta lista.
 */
export const CLEANABLE_TABLES = [
  { key: "inventory",              label: "Estoque (inventory)",                    sql: "inventory" },
  { key: "inventoryMovements",     label: "Movimentações de Estoque",               sql: "inventoryMovements" },
  { key: "labelAssociations",      label: "Associações de Etiqueta",                sql: "labelAssociations" },
  { key: "labelReadings",          label: "Leituras de Etiqueta",                   sql: "labelReadings" },
  { key: "blindConferenceSessions",label: "Sessões de Conferência Cega",            sql: "blindConferenceSessions" },
  { key: "blindConferenceItems",   label: "Itens de Conferência Cega",              sql: "blindConferenceItems" },
  { key: "blindConferenceAdjustments", label: "Ajustes de Conferência Cega",       sql: "blindConferenceAdjustments" },
  { key: "receivingOrders",        label: "Ordens de Recebimento",                  sql: "receivingOrders" },
  { key: "receivingOrderItems",    label: "Itens de Ordens de Recebimento",         sql: "receivingOrderItems" },
  { key: "receivingConferences",   label: "Conferências de Recebimento",            sql: "receivingConferences" },
  { key: "receivingDivergences",   label: "Divergências de Recebimento",            sql: "receivingDivergences" },
  { key: "receivingPreallocations",label: "Pré-Alocações de Recebimento",           sql: "receivingPreallocations" },
  { key: "nonConformities",        label: "Não-Conformidades (NCG)",                sql: "nonConformities" },
  { key: "divergenceApprovals",    label: "Aprovações de Divergência",              sql: "divergenceApprovals" },
  { key: "pickingOrders",          label: "Pedidos de Separação",                   sql: "pickingOrders" },
  { key: "pickingOrderItems",      label: "Itens de Pedidos de Separação",          sql: "pickingOrderItems" },
  { key: "pickingWaves",           label: "Ondas de Separação",                     sql: "pickingWaves" },
  { key: "pickingWaveItems",       label: "Itens de Ondas de Separação",            sql: "pickingWaveItems" },
  { key: "pickingAllocations",     label: "Alocações de Picking",                   sql: "pickingAllocations" },
  { key: "pickingAuditLogs",       label: "Logs de Auditoria de Picking",           sql: "pickingAuditLogs" },
  { key: "pickingProgress",        label: "Progresso de Picking",                   sql: "pickingProgress" },
  { key: "stageChecks",            label: "Conferências de Expedição (Stage)",      sql: "stageChecks" },
  { key: "stageCheckItems",        label: "Itens de Conferência de Expedição",      sql: "stageCheckItems" },
  { key: "shipments",              label: "Expedições (Shipments)",                 sql: "shipments" },
  { key: "shipmentManifests",      label: "Romaneios",                              sql: "shipmentManifests" },
  { key: "shipmentManifestItems",  label: "Itens de Romaneio",                      sql: "shipmentManifestItems" },
  { key: "invoices",               label: "Notas Fiscais (Invoices)",               sql: "invoices" },
  { key: "pickingInvoiceItems",    label: "Itens de NF de Picking",                 sql: "pickingInvoiceItems" },
  { key: "receivingInvoiceItems",  label: "Itens de NF de Recebimento",             sql: "receivingInvoiceItems" },
  { key: "auditLogs",              label: "Logs de Auditoria Geral",                sql: "auditLogs" },
  { key: "reportLogs",             label: "Logs de Relatórios",                     sql: "reportLogs" },
  { key: "labelPrintHistory",      label: "Histórico de Impressão de Etiquetas",   sql: "labelPrintHistory" },
  { key: "productLabels",          label: "Etiquetas de Produto",                   sql: "productLabels" },
  { key: "productLocationMapping", label: "Mapeamento Produto-Endereço",            sql: "productLocationMapping" },
  { key: "inventoryCounts",        label: "Contagens de Inventário",                sql: "inventoryCounts" },
  { key: "inventoryCountItems",    label: "Itens de Contagem de Inventário",        sql: "inventoryCountItems" },
  { key: "recalls",                label: "Recalls",                                sql: "recalls" },
  { key: "returns",                label: "Devoluções",                             sql: "returns" },
  { key: "clientPortalSessions",   label: "Sessões do Portal do Cliente",           sql: "clientPortalSessions" },
] as const;

export type CleanableTableKey = typeof CLEANABLE_TABLES[number]["key"];

export const maintenanceRouter = router({
  /**
   * Sincronizar reservas de estoque
   *
   * Recalcula reservedQuantity em todos os registros de estoque
   * baseado apenas em pedidos ativos. Corrige reservas órfãs.
   */
  syncReservations: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new Error("Apenas administradores podem executar sincronização de reservas");
      }
      console.log(`[maintenanceRouter] Sincronização de reservas iniciada por ${ctx.user.name} (${ctx.user.id})`);
      const result = await syncInventoryReservations();
      console.log(`[maintenanceRouter] Sincronização concluída: ${result.correctionsApplied} correções aplicadas`);
      return {
        success: true,
        message: `Sincronização concluída. ${result.correctionsApplied} correção(ões) aplicada(s) em ${result.totalProcessed} registro(s).`,
        totalProcessed: result.totalProcessed,
        correctionsApplied: result.correctionsApplied,
        corrections: result.corrections,
      };
    }),

  /**
   * Obter estatísticas de reservas
   *
   * Retorna informações sobre reservas de estoque para monitoramento
   */
  getReservationStats: protectedProcedure
    .query(async () => {
      const { getDb } = await import("./db");
      const { inventory, pickingOrders } = await import("../drizzle/schema");
      const { sql } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [stats] = await db
        .select({
          totalInventoryRecords: sql<number>`COUNT(*)`,
          recordsWithReservation: sql<number>`SUM(CASE WHEN ${inventory.reservedQuantity} > 0 THEN 1 ELSE 0 END)`,
          totalReservedUnits: sql<number>`SUM(${inventory.reservedQuantity})`,
        })
        .from(inventory);

      const [orderStats] = await db
        .select({
          activePendingOrders: sql<number>`COUNT(DISTINCT CASE WHEN ${pickingOrders.status} = 'pending' THEN ${pickingOrders.id} END)`,
          activeInProgressOrders: sql<number>`COUNT(DISTINCT CASE WHEN ${pickingOrders.status} = 'in_progress' THEN ${pickingOrders.id} END)`,
          activeSeparatedOrders: sql<number>`COUNT(DISTINCT CASE WHEN ${pickingOrders.status} = 'separated' THEN ${pickingOrders.id} END)`,
          activeInWaveOrders: sql<number>`COUNT(DISTINCT CASE WHEN ${pickingOrders.status} = 'in_wave' THEN ${pickingOrders.id} END)`,
        })
        .from(pickingOrders)
        .where(sql`${pickingOrders.status} IN ('pending', 'in_progress', 'separated', 'in_wave')`);

      return {
        inventory: {
          totalRecords: stats.totalInventoryRecords,
          recordsWithReservation: stats.recordsWithReservation,
          totalReservedUnits: stats.totalReservedUnits,
        },
        orders: {
          pending: orderStats.activePendingOrders,
          inProgress: orderStats.activeInProgressOrders,
          separated: orderStats.activeSeparatedOrders,
          inWave: orderStats.activeInWaveOrders,
          total:
            orderStats.activePendingOrders +
            orderStats.activeInProgressOrders +
            orderStats.activeSeparatedOrders +
            orderStats.activeInWaveOrders,
        },
      };
    }),

  /**
   * Listar tabelas disponíveis para limpeza
   */
  listCleanableTables: protectedProcedure
    .query(({ ctx }) => {
      if (ctx.user.role !== "admin" || ctx.user.tenantId !== 1) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o Admin Global (tenantId: 1) pode acessar esta função" });
      }
      return CLEANABLE_TABLES.map(t => ({ key: t.key, label: t.label }));
    }),

  /**
   * Truncar tabelas selecionadas
   *
   * Acesso restrito: role === 'admin' E tenantId === 1 (Global Admin Med@x).
   * As tabelas são truncadas em ordem segura (filhos antes de pais) para
   * evitar violações de FK. A operação é registrada no console para auditoria.
   *
   * dryRun = true  → apenas conta os registros, sem deletar
   * dryRun = false → executa o DELETE em cada tabela selecionada
   */
  truncateTables: protectedProcedure
    .input(
      z.object({
        tables: z.array(z.string()).min(1, "Selecione ao menos uma tabela"),
        dryRun: z.boolean().default(true),
        confirmPhrase: z.string().optional(), // deve ser "CONFIRMAR LIMPEZA" para dryRun=false
      })
    )
    .mutation(async ({ ctx, input }) => {
      // ── Verificação de acesso ──────────────────────────────────────────────
      if (ctx.user.role !== "admin" || ctx.user.tenantId !== 1) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas o Admin Global (tenantId: 1) pode executar limpeza de tabelas",
        });
      }

      if (!input.dryRun && input.confirmPhrase !== "CONFIRMAR LIMPEZA") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Frase de confirmação incorreta. Digite exatamente: CONFIRMAR LIMPEZA",
        });
      }

      // ── Validar que todas as tabelas solicitadas estão na whitelist ────────
      const allowedKeys = new Set(CLEANABLE_TABLES.map(t => t.key));
      const invalidTables = input.tables.filter(t => !allowedKeys.has(t as CleanableTableKey));
      if (invalidTables.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Tabelas não permitidas: ${invalidTables.join(", ")}`,
        });
      }

      const { getDb } = await import("./db");
      const { sql } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // ── Ordenar tabelas para respeitar dependências FK (filhos primeiro) ───
      // A ordem na CLEANABLE_TABLES já está estruturada de forma segura;
      // mantemos a ordem de input mas priorizamos as tabelas filhas.
      const FK_ORDER: CleanableTableKey[] = [
        "clientPortalSessions", "reportLogs", "auditLogs",
        "pickingAuditLogs", "pickingProgress", "pickingAllocations",
        "pickingWaveItems", "pickingWaves", "stageCheckItems", "stageChecks",
        "shipmentManifestItems", "shipmentManifests", "shipments",
        "pickingInvoiceItems", "receivingInvoiceItems", "invoices",
        "pickingOrderItems", "pickingOrders",
        "blindConferenceAdjustments", "blindConferenceItems", "blindConferenceSessions",
        "divergenceApprovals", "nonConformities",
        "receivingDivergences", "receivingConferences", "receivingPreallocations",
        "receivingOrderItems", "receivingOrders",
        "labelReadings", "labelAssociations", "labelPrintHistory", "productLabels",
        "inventoryCountItems", "inventoryCounts",
        "inventoryMovements", "inventory",
        "productLocationMapping", "returns", "recalls",
      ];

      const orderedTables = [
        ...FK_ORDER.filter(k => input.tables.includes(k)),
        ...input.tables.filter(k => !FK_ORDER.includes(k as CleanableTableKey)),
      ];

      // ── Contar registros (dry-run ou pré-confirmação) ──────────────────────
      const counts: Record<string, number> = {};
      for (const key of orderedTables) {
        const tableInfo = CLEANABLE_TABLES.find(t => t.key === key)!;
        const [row] = await db.execute(sql.raw(`SELECT COUNT(*) as cnt FROM \`${tableInfo.sql}\``)) as unknown as [{ cnt: number }[]];
        counts[key] = Number(row[0]?.cnt ?? 0);
      }

      if (input.dryRun) {
        return {
          dryRun: true,
          tables: orderedTables.map(key => ({
            key,
            label: CLEANABLE_TABLES.find(t => t.key === key)!.label,
            recordCount: counts[key],
          })),
          totalRecords: Object.values(counts).reduce((a, b) => a + b, 0),
          deletedTotal: 0,
        };
      }

      // ── Executar limpeza ───────────────────────────────────────────────────
      const results: Array<{ key: string; label: string; deleted: number }> = [];
      let deletedTotal = 0;

      // Desabilitar FK checks temporariamente para truncate seguro
      await db.execute(sql.raw("SET FOREIGN_KEY_CHECKS = 0"));
      try {
        for (const key of orderedTables) {
          const tableInfo = CLEANABLE_TABLES.find(t => t.key === key)!;
          await db.execute(sql.raw(`DELETE FROM \`${tableInfo.sql}\``));
          const deleted = counts[key];
          results.push({ key, label: tableInfo.label, deleted });
          deletedTotal += deleted;
          console.log(
            `[maintenanceRouter] TRUNCATE ${tableInfo.sql}: ${deleted} registros removidos por ${ctx.user.name} (id=${ctx.user.id}, tenantId=${ctx.user.tenantId})`
          );
        }
      } finally {
        await db.execute(sql.raw("SET FOREIGN_KEY_CHECKS = 1"));
      }

      return {
        dryRun: false,
        tables: results,
        totalRecords: Object.values(counts).reduce((a, b) => a + b, 0),
        deletedTotal,
      };
    }),

  /**
   * Limpeza de registros órfãos de inventário
   *
   * Critérios de órfão:
   * 1. Zona NCG sem nonConformity correspondente (labelCode sem registro em nonConformities)
   * 2. Zona REC com quantity = 0 (resquício de tentativa falha de finish)
   * 3. locationId inexistente (endereço foi deletado)
   * 4. productId inexistente (produto foi deletado)
   *
   * dryRun = true  → apenas relatório, sem deletar
   * dryRun = false → executa a limpeza
   */
  cleanupOrphanInventory: protectedProcedure
    .input(
      z.object({
        dryRun: z.boolean().default(true),
        tenantId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new Error("Apenas administradores podem executar limpeza de inventário");
      }

      const { getDb } = await import("./db");
      const { inventory, nonConformities, warehouseLocations, products } = await import("../drizzle/schema");
      const { sql, and, eq, notInArray, inArray } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      type OrphanRecord = {
        id: number;
        reason: string;
        labelCode: string | null;
        uniqueCode: string | null;
        locationZone: string | null;
        tenantId: number | null;
        quantity: number;
        createdAt: Date;
      };

      const orphans: OrphanRecord[] = [];
      const tenantFilter = input.tenantId ? eq(inventory.tenantId, input.tenantId) : sql`1=1`;

      // ── Critério 1: NCG sem nonConformity correspondente ──────────────────
      const ncgItems = await db
        .select({
          id: inventory.id,
          labelCode: inventory.labelCode,
          uniqueCode: inventory.uniqueCode,
          locationZone: inventory.locationZone,
          tenantId: inventory.tenantId,
          quantity: inventory.quantity,
          createdAt: inventory.createdAt,
        })
        .from(inventory)
        .where(and(eq(inventory.locationZone, "NCG"), tenantFilter));

      for (const item of ncgItems) {
        if (!item.labelCode) {
          orphans.push({ ...item, reason: "NCG sem labelCode (registro incompleto de tentativa falha)" });
          continue;
        }
        // Normalizar: remover sufixo -NCG para buscar o labelCode original
        const originalLabelCode = item.labelCode.replace(/-NCG$/, "");
        const ncgRecord = await db
          .select({ id: nonConformities.id })
          .from(nonConformities)
          .where(eq(nonConformities.labelCode, originalLabelCode))
          .limit(1);
        if (ncgRecord.length === 0) {
          orphans.push({
            ...item,
            reason: "NCG sem nonConformity correspondente (tentativa falha de finish)",
          });
        }
      }

      // ── Critério 2: quantity = 0 em qualquer zona ─────────────────────────
      // Inventory deve conter APENAS registros com saldo positivo.
      // Registros com quantity=0 são resíduos de operações que não executaram o DELETE.
      const zeroQtyItems = await db
        .select({
          id: inventory.id,
          labelCode: inventory.labelCode,
          uniqueCode: inventory.uniqueCode,
          locationZone: inventory.locationZone,
          tenantId: inventory.tenantId,
          quantity: inventory.quantity,
          createdAt: inventory.createdAt,
        })
        .from(inventory)
        .where(and(eq(inventory.quantity, 0), tenantFilter));

      for (const item of zeroQtyItems) {
        orphans.push({ ...item, reason: `quantity = 0 na zona ${item.locationZone ?? 'desconhecida'} (resíduo de operação sem DELETE)` });
      }

      // ── Critério 3: locationId inexistente ────────────────────────────────
      const allLocationIds = (
        await db.select({ id: warehouseLocations.id }).from(warehouseLocations)
      ).map((l) => l.id);

      if (allLocationIds.length > 0) {
        const invalidLocationItems = await db
          .select({
            id: inventory.id,
            labelCode: inventory.labelCode,
            uniqueCode: inventory.uniqueCode,
            locationZone: inventory.locationZone,
            tenantId: inventory.tenantId,
            quantity: inventory.quantity,
            createdAt: inventory.createdAt,
          })
          .from(inventory)
          .where(and(notInArray(inventory.locationId, allLocationIds), tenantFilter));

        for (const item of invalidLocationItems) {
          orphans.push({ ...item, reason: "locationId inexistente (endereço foi deletado)" });
        }
      }

      // ── Critério 4: productId inexistente ─────────────────────────────────
      const allProductIds = (
        await db.select({ id: products.id }).from(products)
      ).map((p) => p.id);

      if (allProductIds.length > 0) {
        const invalidProductItems = await db
          .select({
            id: inventory.id,
            labelCode: inventory.labelCode,
            uniqueCode: inventory.uniqueCode,
            locationZone: inventory.locationZone,
            tenantId: inventory.tenantId,
            quantity: inventory.quantity,
            createdAt: inventory.createdAt,
          })
          .from(inventory)
          .where(and(notInArray(inventory.productId, allProductIds), tenantFilter));

        for (const item of invalidProductItems) {
          orphans.push({ ...item, reason: "productId inexistente (produto foi deletado)" });
        }
      }

      // Deduplicar por id
      const uniqueOrphans = Array.from(new Map(orphans.map((o) => [o.id, o])).values());

      let deletedCount = 0;
      if (!input.dryRun && uniqueOrphans.length > 0) {
        const idsToDelete = uniqueOrphans.map((o) => o.id);
        await db.delete(inventory).where(inArray(inventory.id, idsToDelete));
        deletedCount = idsToDelete.length;
        console.log(
          `[maintenanceRouter] Limpeza de órfãos: ${deletedCount} registros removidos por ${ctx.user.name} (${ctx.user.id})`
        );
      }

      return {
        dryRun: input.dryRun,
        orphansFound: uniqueOrphans.length,
        deletedCount,
        orphans: uniqueOrphans.map((o) => ({
          id: o.id,
          reason: o.reason,
          labelCode: o.labelCode,
          uniqueCode: o.uniqueCode,
          locationZone: o.locationZone,
          tenantId: o.tenantId,
          quantity: o.quantity,
          createdAt: o.createdAt,
        })),
      };
    }),
});
