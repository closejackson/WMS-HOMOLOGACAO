/**
 * clientPortalRouter.ts
 *
 * Router tRPC para o Portal do Cliente.
 * Todos os endpoints requerem autenticação via token de sessão do portal
 * (diferente da sessão OAuth do painel WMS principal).
 *
 * Registrar em server/routers.ts:
 *   import { clientPortalRouter } from "./clientPortalRouter";
 *   // dentro do appRouter:
 *   clientPortal: clientPortalRouter,
 */

import { router, publicProcedure, protectedProcedure, TRPCError } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import {
  systemUsers,
  tenants,
  clientPortalSessions,
  inventory,
  products,
  warehouseLocations,
  warehouseZones,
  pickingOrders,
  pickingOrderItems,
  
  pickingAllocations,
  receivingOrders,
  receivingOrderItems,
  inventoryMovements,
} from "../drizzle/schema";
import { eq, and, desc, gte, lte, sql, gt, like, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import * as crypto from "crypto";
import { sendEmail, createApprovalEmailTemplate } from "./_core/emailNotification";
import { getUniqueCode } from "./utils/uniqueCode";
import { toMySQLDate } from "../shared/utils";

// ============================================================================
// HELPERS DE AUTENTICAÇÃO DO PORTAL
// ============================================================================

const PORTAL_SESSION_COOKIE = "client_portal_session";
const SESSION_DURATION_HOURS = 8;

/**
 * Extrai e valida o token de sessão do portal a partir do cookie da requisição.
 * Retorna { systemUserId, tenantId } se válido, ou lança UNAUTHORIZED.
 */
async function getPortalSession(req: any) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  // Lê o cookie de sessão do portal (formato: Bearer <token> ou cookie direto)
  const cookieHeader = req.headers?.cookie ?? "";
  const cookieToken = cookieHeader
    .split(";")
    .map((c: string) => c.trim())
    .find((c: string) => c.startsWith(`${PORTAL_SESSION_COOKIE}=`))
    ?.split("=")[1];

  const authHeader = req.headers?.authorization ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  const token = cookieToken || bearerToken;

  if (!token) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão do portal inválida ou expirada. Faça login novamente." });
  }

  const sessions = await db
    .select({
      id: clientPortalSessions.id,
      tenantId: clientPortalSessions.tenantId,
      systemUserId: clientPortalSessions.systemUserId,
      expiresAt: clientPortalSessions.expiresAt,
    })
    .from(clientPortalSessions)
    .where(eq(clientPortalSessions.token, token))
    .limit(1);

  const session = sessions[0];

  if (!session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão não encontrada. Faça login novamente." });
  }

  if (session.expiresAt < new Date()) {
    // Limpar sessão expirada
    await db.delete(clientPortalSessions).where(eq(clientPortalSessions.id, session.id));
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão expirada. Faça login novamente." });
  }

  return { systemUserId: session.systemUserId, tenantId: session.tenantId };
}

// ============================================================================
// ROUTER
// ============================================================================

export const clientPortalRouter = router({

  // ══════════════════════════════════════════════════════════════════════════
  // AUTH — Login / Logout / Me
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Login do cliente no portal.
   * Recebe login + senha, valida contra systemUsers, retorna token de sessão.
   * O token é definido como cookie HttpOnly pelo servidor.
   */
  login: publicProcedure
    .input(z.object({
      login: z.string().min(1, "Login obrigatório"),
      password: z.string().min(1, "Senha obrigatória"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Buscar usuário pelo login (login é único por tenant, mas no portal o login é globalmente único nos systemUsers)
      const userRows = await db
        .select({
          id: systemUsers.id,
          tenantId: systemUsers.tenantId,
          fullName: systemUsers.fullName,
          email: systemUsers.email,
          passwordHash: systemUsers.passwordHash,
          active: systemUsers.active,
          failedLoginAttempts: systemUsers.failedLoginAttempts,
          lockedUntil: systemUsers.lockedUntil,
        })
        .from(systemUsers)
        .where(eq(systemUsers.login, input.login))
        .limit(1);

      const user = userRows[0];

      // Retorno genérico para não vazar se login existe ou não
      const INVALID_CREDENTIALS_MSG = "Login ou senha incorretos.";

      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: INVALID_CREDENTIALS_MSG });
      }

      if (!user.active) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Usuário inativo. Contate o administrador do WMS." });
      }

      // Verificar bloqueio por força bruta
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const unlockMinutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Conta bloqueada por excesso de tentativas. Tente novamente em ${unlockMinutes} minuto(s).`,
        });
      }

      // Verificar senha com hash SHA-256 (compatível com criação de usuários no WMS)
      // NOTA: se o sistema usar bcrypt no futuro, trocar para bcrypt.compare
      const hashedInput = crypto
        .createHash("sha256")
        .update(input.password)
        .digest("hex");

      const passwordValid = hashedInput === user.passwordHash;

      if (!passwordValid) {
        // Incrementar tentativas falhas
        const newAttempts = (user.failedLoginAttempts ?? 0) + 1;
        const lockedUntil = newAttempts >= 5
          ? new Date(Date.now() + 15 * 60 * 1000) // bloqueia 15 min após 5 tentativas
          : null;

        await db.update(systemUsers)
          .set({ failedLoginAttempts: newAttempts, lockedUntil })
          .where(eq(systemUsers.id, user.id));

        const remaining = 5 - newAttempts;
        const suffix = remaining > 0
          ? ` (${remaining} tentativa(s) restante(s) antes do bloqueio)`
          : " Conta bloqueada por 15 minutos.";

        throw new TRPCError({ code: "UNAUTHORIZED", message: `${INVALID_CREDENTIALS_MSG}${suffix}` });
      }

      // Verificar se usuário tem tenantId atribuído
      if (!user.tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Seu acesso ainda não foi aprovado. Aguarde a liberação do administrador." });
      }

      // Reset contagem de tentativas e atualiza lastLogin
      await db.update(systemUsers)
        .set({ failedLoginAttempts: 0, lockedUntil: null, lastLogin: new Date() })
        .where(eq(systemUsers.id, user.id));

      // Buscar dados do tenant
      const tenantRows = await db
        .select({ id: tenants.id, name: tenants.name, tradeName: tenants.tradeName })
        .from(tenants)
        .where(eq(tenants.id, user.tenantId))
        .limit(1);
      const tenant = tenantRows[0];

      if (!tenant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado. Contate o administrador." });
      }

      // Criar token de sessão
      const token = nanoid(64);
      const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000);

      await db.insert(clientPortalSessions).values({
        tenantId: user.tenantId,
        systemUserId: user.id,
        token,
        expiresAt,
        ipAddress: ctx.req?.ip ?? ctx.req?.connection?.remoteAddress ?? null,
        userAgent: ctx.req?.headers?.["user-agent"] ?? null,
      });

      // Definir cookie HttpOnly
      ctx.res.cookie(PORTAL_SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        expires: expiresAt,
        path: "/",
      });

      return {
        success: true,
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          tenantId: user.tenantId,
          tenantName: tenant.tradeName ?? tenant.name,
        },
      };
    }),

  /**
   * Encerra a sessão do portal do cliente.
   */
  logout: publicProcedure
    .mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { success: true };

      try {
        const cookieHeader = ctx.req?.headers?.cookie ?? "";
        const token = cookieHeader
          .split(";")
          .map((c: string) => c.trim())
          .find((c: string) => c.startsWith(`${PORTAL_SESSION_COOKIE}=`))
          ?.split("=")[1];

        if (token) {
          await db.delete(clientPortalSessions).where(eq(clientPortalSessions.token, token));
        }
      } catch {
        // Ignorar erros ao fazer logout
      }

      ctx.res.clearCookie(PORTAL_SESSION_COOKIE, { path: "/" });
      return { success: true };
    }),

  /**
   * Retorna os dados do usuário/tenant da sessão ativa.
   */
  me: publicProcedure
    .query(async ({ ctx }) => {
      try {
        const session = await getPortalSession(ctx.req);
        const db = await getDb();
        if (!db) return null;

        const userRows = await db
          .select({
            id: systemUsers.id,
            fullName: systemUsers.fullName,
            email: systemUsers.email,
            tenantId: systemUsers.tenantId,
            tenantName: tenants.name,
            tenantTradeName: tenants.tradeName,
          })
          .from(systemUsers)
          .innerJoin(tenants, eq(systemUsers.tenantId, tenants.id))
          .where(eq(systemUsers.id, session.systemUserId))
          .limit(1);

        const user = userRows[0];
        if (!user) return null;

        return {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          tenantId: user.tenantId,
          tenantName: user.tenantTradeName ?? user.tenantName,
        };
      } catch {
        return null;
      }
    }),

  // ══════════════════════════════════════════════════════════════════════════
  // ESTOQUE — visão do cliente sobre seu próprio estoque
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Resumo de estoque do cliente: totais por status.
   */
  stockSummary: publicProcedure
    .query(async ({ ctx }) => {
      const { tenantId } = await getPortalSession(ctx.req);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const rows = await db
        .select({
          status: inventory.status,
          totalItems: sql<number>`COUNT(DISTINCT ${inventory.productId})`,
          totalQuantity: sql<number>`SUM(${inventory.quantity})`,
          totalReserved: sql<number>`SUM(${inventory.reservedQuantity})`,
        })
        .from(inventory)
        .where(and(
          eq(inventory.tenantId, tenantId),
          gt(inventory.quantity, 0),
        ))
        .groupBy(inventory.status);

      const totalByStatus: Record<string, { items: number; quantity: number; reserved: number }> = {};
      let grandTotalQty = 0;
      let grandTotalReserved = 0;
      let distinctProducts = 0;

      for (const row of rows) {
        totalByStatus[row.status] = {
          items: Number(row.totalItems),
          quantity: Number(row.totalQuantity),
          reserved: Number(row.totalReserved),
        };
        grandTotalQty += Number(row.totalQuantity);
        grandTotalReserved += Number(row.totalReserved);
        distinctProducts += Number(row.totalItems);
      }

      // Produtos próximos ao vencimento (≤ 90 dias)
      const ninetyDays = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      const expiringRows = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(inventory)
        .where(and(
          eq(inventory.tenantId, tenantId),
          gt(inventory.quantity, 0),
          lte(inventory.expiryDate, ninetyDays),
          gte(inventory.expiryDate, new Date()),
        ));

      return {
        totalQuantity: grandTotalQty,
        availableQuantity: grandTotalQty - grandTotalReserved,
        reservedQuantity: grandTotalReserved,
        distinctProducts,
        byStatus: totalByStatus,
        expiringIn90Days: Number(expiringRows[0]?.count ?? 0),
      };
    }),

  /**
   * Lista de produtos com estoque disponível para o cliente.
   * Retorna apenas produtos que possuem estoque (quantity > 0 e status = 'available').
   */
  products: publicProcedure
    .query(async ({ ctx }) => {
      const { tenantId } = await getPortalSession(ctx.req);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      console.log('[clientPortal.products] Buscando produtos com estoque para tenantId:', tenantId);

      // Buscar produtos únicos que possuem estoque disponível
      const rows = await db
        .selectDistinct({
          id: products.id,
          sku: products.sku,
          description: products.description,
          category: products.category,
          unitOfMeasure: products.unitOfMeasure,
          unitsPerBox: products.unitsPerBox,
        })
        .from(products)
        .innerJoin(inventory, eq(inventory.productId, products.id))
        .where(
          and(
            eq(products.tenantId, tenantId),
            eq(inventory.tenantId, tenantId),
            eq(inventory.status, "available"),
            gt(inventory.quantity, 0)
          )
        )
        .orderBy(products.description)
        .limit(1000);

      console.log('[clientPortal.products] Produtos com estoque encontrados:', rows.length);

      return rows;
    }),

  /**
   * Posições de estoque do cliente com filtros.
   */
  stockPositions: publicProcedure
    .input(z.object({
      search: z.string().optional(),
      batch: z.string().optional(),
      status: z.enum(["available", "quarantine", "blocked", "expired"]).optional(),
      expiryBefore: z.string().optional(), // ISO date
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(200).default(50),
    }))
    .query(async ({ input, ctx }) => {
      const { tenantId } = await getPortalSession(ctx.req);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      console.log('[stockPositions] Query iniciada:', { tenantId, input });

      const conditions = [
        eq(inventory.tenantId, tenantId),
        gt(inventory.quantity, 0),
      ];

      if (input.status) {
        conditions.push(eq(inventory.status, input.status));
      }
      if (input.batch) {
        conditions.push(like(inventory.batch, `%${input.batch}%`));
      }
      if (input.expiryBefore) {
        conditions.push(lte(inventory.expiryDate, new Date(input.expiryBefore)));
      }
      if (input.search) {
        conditions.push(or(
          like(products.sku, `%${input.search}%`),
          like(products.description, `%${input.search}%`),
        )!);
      }

      const offset = (input.page - 1) * input.pageSize;

      const rows = await db
        .select({
          inventoryId: inventory.id,
          productId: inventory.productId,
          sku: products.sku,
          description: products.description,
          batch: inventory.batch,
          expiryDate: inventory.expiryDate,
          quantity: inventory.quantity,
          reservedQuantity: inventory.reservedQuantity,
          status: inventory.status,
          code: warehouseLocations.code,
          zoneName: warehouseZones.name,
          unitOfMeasure: products.unitOfMeasure,
        })
        .from(inventory)
        .innerJoin(products, eq(inventory.productId, products.id))
        .innerJoin(warehouseLocations, eq(inventory.locationId, warehouseLocations.id))
        .innerJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
        .where(and(...conditions))
        .orderBy(inventory.expiryDate, products.description)
        .limit(input.pageSize)
        .offset(offset);

      // Total para paginação
      const totalRows = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(inventory)
        .innerJoin(products, eq(inventory.productId, products.id))
        .where(and(...conditions));

      const result = {
        items: rows.map(r => ({
          ...r,
          availableQuantity: r.quantity - (r.reservedQuantity ?? 0),
        })),
        total: Number(totalRows[0]?.count ?? 0),
        page: input.page,
        pageSize: input.pageSize,
      };

      console.log('[stockPositions] Resultado:', { itemsCount: result.items.length, total: result.total });

      return result;
    }),

  /**
   * Produtos próximos ao vencimento (≤ N dias).
   */
  expiringProducts: publicProcedure
    .input(z.object({
      days: z.number().min(1).max(365).default(90),
    }))
    .query(async ({ input, ctx }) => {
      const { tenantId } = await getPortalSession(ctx.req);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const limitDate = new Date(Date.now() + input.days * 24 * 60 * 60 * 1000);

      return await db
        .select({
          productId: inventory.productId,
          sku: products.sku,
          description: products.description,
          batch: inventory.batch,
          expiryDate: inventory.expiryDate,
          quantity: inventory.quantity,
          code: warehouseLocations.code,
        })
        .from(inventory)
        .innerJoin(products, eq(inventory.productId, products.id))
        .innerJoin(warehouseLocations, eq(inventory.locationId, warehouseLocations.id))
        .where(and(
          eq(inventory.tenantId, tenantId),
          gt(inventory.quantity, 0),
          lte(inventory.expiryDate, limitDate),
          gte(inventory.expiryDate, new Date()),
        ))
        .orderBy(inventory.expiryDate);
    }),

  // ══════════════════════════════════════════════════════════════════════════
  // PEDIDOS DE SAÍDA (picking orders)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Lista pedidos de saída do cliente com filtros e paginação.
   */
  orders: publicProcedure
    .input(z.object({
      status: z.enum(["pending", "validated", "in_wave", "picking", "picked",
        "checking", "packed", "staged", "invoiced", "shipped", "cancelled"]).optional(),
      search: z.string().optional(), // busca por número do pedido
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const { tenantId } = await getPortalSession(ctx.req);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const conditions = [eq(pickingOrders.tenantId, tenantId)];

      if (input.status) conditions.push(eq(pickingOrders.status, input.status));
      if (input.search) {
        conditions.push(or(
          like(pickingOrders.orderNumber, `%${input.search}%`),
          like(pickingOrders.customerOrderNumber, `%${input.search}%`),
        )!);
      }
      if (input.dateFrom) conditions.push(gte(pickingOrders.createdAt, new Date(input.dateFrom)));
      if (input.dateTo) conditions.push(lte(pickingOrders.createdAt, new Date(input.dateTo)));

      const offset = (input.page - 1) * input.pageSize;

      const orders = await db
        .select({
          id: pickingOrders.id,
          orderNumber: pickingOrders.orderNumber,
          customerOrderNumber: pickingOrders.customerOrderNumber,
          status: pickingOrders.status,
          shippingStatus: pickingOrders.shippingStatus,
          priority: pickingOrders.priority,
          totalItems: pickingOrders.totalItems,
          totalQuantity: pickingOrders.totalQuantity,
          scheduledDate: pickingOrders.scheduledDate,
          shippedAt: pickingOrders.shippedAt,
          nfeNumber: pickingOrders.nfeNumber,
          nfeKey: pickingOrders.nfeKey,
          notes: pickingOrders.notes,
          createdAt: pickingOrders.createdAt,
          updatedAt: pickingOrders.updatedAt,
        })
        .from(pickingOrders)
        .where(and(...conditions))
        .orderBy(desc(pickingOrders.createdAt))
        .limit(input.pageSize)
        .offset(offset);

      const totalRows = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(pickingOrders)
        .where(and(...conditions));

      return {
        items: orders,
        total: Number(totalRows[0]?.count ?? 0),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  /**
   * Detalhes de um pedido de saída específico, com seus itens.
   */
  orderDetail: publicProcedure
    .input(z.object({ orderId: z.number() }))
    .query(async ({ input, ctx }) => {
      const { tenantId } = await getPortalSession(ctx.req);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Valida que o pedido pertence ao tenant
      const orderRows = await db
        .select()
        .from(pickingOrders)
        .where(and(
          eq(pickingOrders.id, input.orderId),
          eq(pickingOrders.tenantId, tenantId),
        ))
        .limit(1);

      const order = orderRows[0];
      if (!order) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
      }

      const items = await db
        .select({
          id: pickingOrderItems.id,
          productId: pickingOrderItems.productId,
          sku: products.sku,
          description: products.description,
          batch: pickingOrderItems.batch,
          expiryDate: pickingOrderItems.expiryDate,
          requestedQuantity: pickingOrderItems.requestedQuantity,
          pickedQuantity: pickingOrderItems.pickedQuantity,
          unit: pickingOrderItems.unit,
          status: pickingOrderItems.status,
        })
        .from(pickingOrderItems)
        .innerJoin(products, eq(pickingOrderItems.productId, products.id))
        .where(eq(pickingOrderItems.pickingOrderId, input.orderId))
        .orderBy(products.description);

      return { order, items };
    }),

  /**
   * Resumo de pedidos por status (para dashboard do cliente).
   */
  ordersSummary: publicProcedure
    .query(async ({ ctx }) => {
      const { tenantId } = await getPortalSession(ctx.req);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const rows = await db
        .select({
          status: pickingOrders.status,
          count: sql<number>`COUNT(*)`,
          totalQty: sql<number>`SUM(${pickingOrders.totalQuantity})`,
        })
        .from(pickingOrders)
        .where(eq(pickingOrders.tenantId, tenantId))
        .groupBy(pickingOrders.status);

      const byStatus: Record<string, { count: number; totalQty: number }> = {};
      for (const row of rows) {
        byStatus[row.status] = {
          count: Number(row.count),
          totalQty: Number(row.totalQty ?? 0),
        };
      }

      return { byStatus };
    }),

  // ══════════════════════════════════════════════════════════════════════════
  // RECEBIMENTOS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Histórico de recebimentos do cliente.
   */
  receivings: publicProcedure
    .input(z.object({
      status: z.enum(["scheduled", "in_progress", "in_quarantine", "addressing", "completed", "cancelled"]).optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const { tenantId } = await getPortalSession(ctx.req);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const conditions = [eq(receivingOrders.tenantId, tenantId)];

      if (input.status) conditions.push(eq(receivingOrders.status, input.status));
      if (input.dateFrom) conditions.push(gte(receivingOrders.createdAt, new Date(input.dateFrom)));
      if (input.dateTo) conditions.push(lte(receivingOrders.createdAt, new Date(input.dateTo)));

      const offset = (input.page - 1) * input.pageSize;

      const rows = await db
        .select({
          id: receivingOrders.id,
          orderNumber: receivingOrders.orderNumber,
          nfeNumber: receivingOrders.nfeNumber,
          nfeKey: receivingOrders.nfeKey,
          supplierName: receivingOrders.supplierName,
          supplierCnpj: receivingOrders.supplierCnpj,
          status: receivingOrders.status,
          scheduledDate: receivingOrders.scheduledDate,
          receivedDate: receivingOrders.receivedDate,
          createdAt: receivingOrders.createdAt,
        })
        .from(receivingOrders)
        .where(and(...conditions))
        .orderBy(desc(receivingOrders.createdAt))
        .limit(input.pageSize)
        .offset(offset);

      const totalRows = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(receivingOrders)
        .where(and(...conditions));

      return {
        items: rows,
        total: Number(totalRows[0]?.count ?? 0),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  /**
   * Detalhes de um recebimento com seus itens.
   */
  receivingDetail: publicProcedure
    .input(z.object({ receivingId: z.number() }))
    .query(async ({ input, ctx }) => {
      const { tenantId } = await getPortalSession(ctx.req);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const orderRows = await db
        .select()
        .from(receivingOrders)
        .where(and(
          eq(receivingOrders.id, input.receivingId),
          eq(receivingOrders.tenantId, tenantId),
        ))
        .limit(1);

      const order = orderRows[0];
      if (!order) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Recebimento não encontrado." });
      }

      const items = await db
        .select({
          id: receivingOrderItems.id,
          productId: receivingOrderItems.productId,
          sku: products.sku,
          description: products.description,
          batch: receivingOrderItems.batch,
          expiryDate: receivingOrderItems.expiryDate,
          expectedQuantity: receivingOrderItems.expectedQuantity,
          receivedQuantity: receivingOrderItems.receivedQuantity,
          status: receivingOrderItems.status,
        })
        .from(receivingOrderItems)
        .innerJoin(products, eq(receivingOrderItems.productId, products.id))
        .where(eq(receivingOrderItems.receivingOrderId, input.receivingId))
        .orderBy(products.description);

      return { order, items };
    }),

  // ══════════════════════════════════════════════════════════════════════════
  // MOVIMENTAÇÕES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Histórico de movimentações de estoque do cliente (audit trail).
   */
  movements: publicProcedure
    .input(z.object({
      productId: z.number().optional(),
      movementType: z.enum(["receiving", "put_away", "picking", "transfer",
        "adjustment", "return", "disposal", "quality"]).optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(30),
    }))
    .query(async ({ input, ctx }) => {
      const { tenantId } = await getPortalSession(ctx.req);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const conditions = [eq(inventoryMovements.tenantId, tenantId)];

      if (input.productId) conditions.push(eq(inventoryMovements.productId, input.productId));
      if (input.movementType) conditions.push(eq(inventoryMovements.movementType, input.movementType));
      if (input.dateFrom) conditions.push(gte(inventoryMovements.createdAt, new Date(input.dateFrom)));
      if (input.dateTo) conditions.push(lte(inventoryMovements.createdAt, new Date(input.dateTo)));

      const offset = (input.page - 1) * input.pageSize;

      const rows = await db
        .select({
          id: inventoryMovements.id,
          productId: inventoryMovements.productId,
          sku: products.sku,
          description: products.description,
          batch: inventoryMovements.batch,
          movementType: inventoryMovements.movementType,
          quantity: inventoryMovements.quantity,
          referenceType: inventoryMovements.referenceType,
          referenceId: inventoryMovements.referenceId,
          notes: inventoryMovements.notes,
          createdAt: inventoryMovements.createdAt,
        })
        .from(inventoryMovements)
        .innerJoin(products, eq(inventoryMovements.productId, products.id))
        .where(and(...conditions))
        .orderBy(desc(inventoryMovements.createdAt))
        .limit(input.pageSize)
        .offset(offset);

      const totalRows = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(inventoryMovements)
        .where(and(...conditions));

      return {
        items: rows,
        total: Number(totalRows[0]?.count ?? 0),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  // ============================================================================
  // AUTO-CADASTRO E APROVAÇÃO DE USUÁRIOS
  // ============================================================================

  /**
   * Endpoint público para auto-cadastro de novos usuários do portal.
   * Cria usuário com status "pending" aguardando aprovação de admin.
   */
  registerNewUser: publicProcedure
    .input(
      z.object({
        fullName: z.string().min(3, "Nome completo deve ter pelo menos 3 caracteres"),
        email: z.string().email("Email inválido"),
        password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
        companyName: z.string().min(3, "Nome da empresa deve ter pelo menos 3 caracteres"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Gerar login a partir do email (parte antes do @)
      const login = input.email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, ".");

      // Verificar se já existe usuário com este email
      const existingUser = await db
        .select({ id: systemUsers.id })
        .from(systemUsers)
        .where(eq(systemUsers.email, input.email))
        .limit(1);

      if (existingUser.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Já existe um usuário cadastrado com este email.",
        });
      }

      // Hash da senha com SHA-256
      const passwordHash = crypto.createHash("sha256").update(input.password).digest("hex");

      // Criar usuário com status pending (tenantId = 0 temporário)
      await db.insert(systemUsers).values({
        tenantId: 0, // Será atribuído pelo admin na aprovação
        fullName: input.fullName,
        login: login,
        email: input.email,
        passwordHash: passwordHash,
        active: false, // Inativo até aprovação
        approvalStatus: "pending",
        failedLoginAttempts: 0,
      });

      return {
        success: true,
        message: "Sua solicitação foi registrada com sucesso. Em breve, você receberá a confirmação da liberação do seu usuário.",
      };
    }),

  /**
   * Endpoint para listar solicitações de cadastro pendentes.
   * Apenas administradores podem acessar.
   */
  listPendingUsers: protectedProcedure.query(async ({ ctx }) => {
    // Verificar se usuário é admin
    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado. Apenas administradores podem visualizar solicitações pendentes." });
    }

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    const pendingUsers = await db
      .select({
        id: systemUsers.id,
        fullName: systemUsers.fullName,
        login: systemUsers.login,
        email: systemUsers.email,
        approvalStatus: systemUsers.approvalStatus,
        createdAt: systemUsers.createdAt,
      })
      .from(systemUsers)
      .where(eq(systemUsers.approvalStatus, "pending"))
      .orderBy(desc(systemUsers.createdAt));

    return pendingUsers;
  }),

  /**
   * Endpoint para aprovar solicitação de cadastro.
   * Atribui tenant, ativa usuário e envia email de confirmação.
   */
  approveUser: protectedProcedure
    .input(
      z.object({
        userId: z.number(),
        tenantId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verificar se usuário é admin
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado. Apenas administradores podem aprovar solicitações." });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Verificar se usuário existe e está pendente
      const user = await db
        .select({
          id: systemUsers.id,
          fullName: systemUsers.fullName,
          email: systemUsers.email,
          login: systemUsers.login,
          approvalStatus: systemUsers.approvalStatus,
        })
        .from(systemUsers)
        .where(eq(systemUsers.id, input.userId))
        .limit(1);

      if (user.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
      }

      if (user[0].approvalStatus !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Usuário já foi aprovado ou rejeitado." });
      }

      // Buscar dados do tenant
      const tenantData = await db
        .select({
          id: tenants.id,
          name: tenants.name,
        })
        .from(tenants)
        .where(eq(tenants.id, input.tenantId))
        .limit(1);

      if (tenantData.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });
      }

      // Aprovar usuário
      await db
        .update(systemUsers)
        .set({
          tenantId: input.tenantId,
          active: true,
          approvalStatus: "approved",
          approvedBy: ctx.user.id,
          approvedAt: new Date(),
        })
        .where(eq(systemUsers.id, input.userId));

      // Enviar email de aprovação
      const portalUrl = `${ctx.req.headers.origin || "https://seu-dominio.com"}/portal/login`;
      const emailHtml = createApprovalEmailTemplate({
        userName: user[0].fullName,
        userLogin: user[0].login,
        tenantName: tenantData[0].name,
        portalUrl,
      });

      const emailSent = await sendEmail({
        to: user[0].email,
        subject: "Acesso Aprovado - Portal do Cliente Med@x",
        htmlContent: emailHtml,
      });

      if (!emailSent) {
        console.warn(`[approveUser] Failed to send approval email to ${user[0].email}`);
      }

      return {
        success: true,
        message: `Usuário ${user[0].fullName} aprovado com sucesso!${emailSent ? " Email de confirmação enviado." : " (Email não enviado)"}`,
      };
    }),

  /**
   * Endpoint para rejeitar solicitação de cadastro.
   */
  rejectUser: protectedProcedure
    .input(
      z.object({
        userId: z.number(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verificar se usuário é admin
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado. Apenas administradores podem rejeitar solicitações." });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Verificar se usuário existe e está pendente
      const user = await db
        .select({
          id: systemUsers.id,
          fullName: systemUsers.fullName,
          approvalStatus: systemUsers.approvalStatus,
        })
        .from(systemUsers)
        .where(eq(systemUsers.id, input.userId))
        .limit(1);

      if (user.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
      }

      if (user[0].approvalStatus !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Usuário já foi aprovado ou rejeitado." });
      }

      // Rejeitar usuário
      await db
        .update(systemUsers)
        .set({
          approvalStatus: "rejected",
          approvedBy: ctx.user.id,
          approvedAt: new Date(),
        })
        .where(eq(systemUsers.id, input.userId));

      return {
        success: true,
        message: `Solicitacao de ${user[0].fullName} rejeitada.`,
      };
    }),

  // ============================================================================
  // GERENCIAMENTO DE PEDIDOS DE SEPARAÇÃO (PORTAL DO CLIENTE)
  // ============================================================================

  /**
   * Endpoint para criar novo pedido de separação.
   * Apenas usuários do portal podem criar pedidos para seu tenant.
   */
  createPickingOrder: publicProcedure
    .input(
      z.object({
        customerOrderNumber: z.string().optional(),
        deliveryAddress: z.string().optional(),
        priority: z.enum(["emergency", "urgent", "normal", "low"]).default("normal"),
        scheduledDate: z.string().optional(), // ISO date string
        notes: z.string().optional(),
        items: z.array(
          z.object({
            productId: z.number(),
            requestedQuantity: z.number().positive(),
            requestedUM: z.enum(["unit", "box", "pallet"]).default("unit"),
          })
        ).min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const session = await getPortalSession(ctx.req);

      // 🔒 ENVOLVER TUDO EM TRANSAÇÃO ATÔMICA
      return await db.transaction(async (tx) => {
        // PASSO 1: Validar produtos e converter quantidades
        const stockValidations: Array<{
          item: typeof input.items[0];
          product: any;
          quantityInUnits: number;
        }> = [];

        for (const item of input.items) {
          // Buscar produto para obter unitsPerBox
          const [product] = await tx
            .select()
            .from(products)
            .where(eq(products.id, item.productId))
            .limit(1);

          if (!product) {
            throw new TRPCError({ 
              code: "NOT_FOUND", 
              message: `Produto ID ${item.productId} não encontrado` 
            });
          }

          // Converter quantidade para unidades se solicitado em caixa
          let quantityInUnits = item.requestedQuantity;
          if (item.requestedUM === "box") {
            if (!product.unitsPerBox || product.unitsPerBox <= 0) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Produto ${product.sku} não possui quantidade por caixa configurada`
              });
            }
            quantityInUnits = item.requestedQuantity * product.unitsPerBox;
          }

          // ⚠️ NOTA: Validação prévia SEM lock (apenas para feedback rápido)
          // O lock real será feito na etapa de reserva
          const availableStock = await tx
            .select({
              id: inventory.id,
              locationId: inventory.locationId,
              locationCode: warehouseLocations.code,
              quantity: inventory.quantity,
              reservedQuantity: inventory.reservedQuantity,
              batch: inventory.batch,
              expiryDate: inventory.expiryDate,
              availableQuantity: sql<number>`${inventory.quantity} - ${inventory.reservedQuantity}`.as('availableQuantity'),
            })
            .from(inventory)
            .leftJoin(warehouseLocations, eq(inventory.locationId, warehouseLocations.id))
            .leftJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
            .where(
              and(
                eq(inventory.tenantId, session.tenantId),
                eq(inventory.productId, item.productId),
                eq(inventory.status, "available"),
                sql`${inventory.quantity} - ${inventory.reservedQuantity} > 0`,
                // Excluir zonas especiais
                sql`${warehouseZones.code} NOT IN ('EXP', 'REC', 'NCG', 'DEV')`
              )
            )
            .orderBy(inventory.expiryDate); // FEFO

          // Calcular total disponível
          const totalAvailable = availableStock.reduce((sum, loc) => sum + loc.availableQuantity, 0);
          
          if (totalAvailable < quantityInUnits) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Estoque insuficiente para produto ${product.sku}. Disponível: ${totalAvailable} unidades, Solicitado: ${quantityInUnits} unidades`
            });
          }

          stockValidations.push({ item, product, quantityInUnits });
        }

        // PASSO 2: Criar pedido
        const orderNumber = `PED-${Date.now()}-${nanoid(6).toUpperCase()}`;

        // Calcular totalQuantity em unidades
        const totalQuantityInUnits = stockValidations.reduce((sum, val) => sum + val.quantityInUnits, 0);

        const [order] = await tx.insert(pickingOrders).values({
          tenantId: session.tenantId,
          orderNumber,
          customerOrderNumber: input.customerOrderNumber || null,
          deliveryAddress: input.deliveryAddress || null,
          priority: input.priority,
          status: "pending",
          totalItems: input.items.length,
          totalQuantity: totalQuantityInUnits,
          scheduledDate: input.scheduledDate ? new Date(input.scheduledDate) : null,
          notes: input.notes || null,
          createdBy: session.systemUserId,
        });

        const orderId = Number(order.insertId);

        // PASSO 3: Reservar estoque atomicamente com SELECT FOR UPDATE
        for (const validation of stockValidations) {
          const { item, product, quantityInUnits } = validation;

          // 🔒 BUSCAR ESTOQUE COM BLOQUEIO PESSIMISTA (FEFO + Lock)
          const lockedStock = await tx
            .select({
              id: inventory.id,
              locationId: inventory.locationId,
              locationCode: warehouseLocations.code,
              quantity: inventory.quantity,
              reservedQuantity: inventory.reservedQuantity,
              batch: inventory.batch,
              expiryDate: inventory.expiryDate,
              labelCode: inventory.labelCode,
            })
            .from(inventory)
            .leftJoin(warehouseLocations, eq(inventory.locationId, warehouseLocations.id))
            .leftJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
            .where(
              and(
                eq(inventory.tenantId, session.tenantId),
                eq(inventory.productId, item.productId),
                eq(inventory.status, "available"),
                sql`${inventory.quantity} - ${inventory.reservedQuantity} > 0`,
                sql`${warehouseZones.code} NOT IN ('EXP', 'REC', 'NCG', 'DEV')`
              )
            )
            .orderBy(inventory.id) // 🔒 ORDEM FIXA para evitar deadlock
            .for('update'); // 🔒 BLOQUEIO PESSIMISTA

          // ✅ REVALIDAÇÃO PÓS-LOCK
          const totalLocked = lockedStock.reduce(
            (sum, s) => sum + (s.quantity - s.reservedQuantity),
            0
          );

          if (totalLocked < quantityInUnits) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Estoque insuficiente após lock para produto ${product.sku}. Disponível: ${totalLocked}, Solicitado: ${quantityInUnits}`
            });
          }

          // Reservar estoque e criar pickingOrderItem para CADA LOTE
          let remainingToReserve = quantityInUnits;
          for (const stock of lockedStock) {
            if (remainingToReserve <= 0) break;

            const availableInStock = stock.quantity - stock.reservedQuantity;
            const toReserve = Math.min(availableInStock, remainingToReserve);
            
            // Incrementar reservedQuantity no inventory
            await tx
              .update(inventory)
              .set({
                reservedQuantity: sql`${inventory.reservedQuantity} + ${toReserve}`
              })
              .where(eq(inventory.id, stock.id));

            // ✅ CRIAR pickingOrderItem PARA ESTE LOTE ESPECÍFICO
            await tx.insert(pickingOrderItems).values({
              pickingOrderId: orderId,
              productId: item.productId,
              requestedQuantity: toReserve,
              requestedUM: "unit",
              unit: (item.requestedUM === "box" ? "box" : "unit") as "unit" | "box",
              unitsPerBox: item.requestedUM === "box" ? product.unitsPerBox : undefined,
              batch: stock.batch,
              expiryDate: stock.expiryDate,
              inventoryId: stock.id,
              status: "pending" as const,
              uniqueCode: getUniqueCode(product.sku, stock.batch),
            });

            // ✅ CRIAR pickingAllocation para este lote
            await tx.insert(pickingAllocations).values({
              pickingOrderId: orderId,
              productId: item.productId,
              productSku: product.sku,
              locationId: stock.locationId,
              locationCode: stock.locationCode ?? "",
              batch: stock.batch,
              expiryDate: stock.expiryDate ?? null,
              uniqueCode: getUniqueCode(product.sku, stock.batch),
              labelCode: stock.labelCode,
              quantity: toReserve,
              isFractional: false,
              sequence: 0,
              status: "pending",
              pickedQuantity: 0,
            });

            remainingToReserve -= toReserve;
          }
        }

        return {
          success: true,
          orderId,
          orderNumber,
          message: "Pedido criado com sucesso!",
        };
      }); // 🔒 FIM DA TRANSAÇÃO
    }),

  /**
   * Endpoint para editar pedido pendente.
   * Apenas pedidos com status "pending" podem ser editados.
   */
  updatePickingOrder: publicProcedure
    .input(
      z.object({
        orderId: z.number(),
        customerOrderNumber: z.string().optional(),
        deliveryAddress: z.string().optional(),
        priority: z.enum(["emergency", "urgent", "normal", "low"]).optional(),
        scheduledDate: z.string().optional(),
        notes: z.string().optional(),
        items: z.array(
          z.object({
            id: z.number().optional(), // Se existir, atualiza; senão, cria novo
            productId: z.number(),
            requestedQuantity: z.number().positive(),
            requestedUM: z.enum(["unit", "box", "pallet"]).default("unit"),
          })
        ).min(1).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const session = await getPortalSession(ctx.req);

      // Verificar se pedido existe e pertence ao tenant
      const order = await db
        .select()
        .from(pickingOrders)
        .where(
          and(
            eq(pickingOrders.id, input.orderId),
            eq(pickingOrders.tenantId, session.tenantId)
          )
        )
        .limit(1);

      if (order.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
      }

      if (order[0].status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas pedidos pendentes podem ser editados." });
      }

      // Atualizar pedido
      const updateData: any = {};
      if (input.customerOrderNumber !== undefined) updateData.customerOrderNumber = input.customerOrderNumber;
      if (input.deliveryAddress !== undefined) updateData.deliveryAddress = input.deliveryAddress;
      if (input.priority) updateData.priority = input.priority;
      if (input.scheduledDate) updateData.scheduledDate = new Date(input.scheduledDate);
      if (input.notes !== undefined) updateData.notes = input.notes;

      if (Object.keys(updateData).length > 0) {
        await db
          .update(pickingOrders)
          .set(updateData)
          .where(eq(pickingOrders.id, input.orderId));
      }

      // Atualizar itens se fornecidos
      if (input.items) {
        // Remover itens antigos
        await db
          .delete(pickingOrderItems)
          .where(eq(pickingOrderItems.pickingOrderId, input.orderId));

        // Inserir novos itens
        const orderItems = input.items.map((item) => ({
          pickingOrderId: input.orderId,
          productId: item.productId,
          requestedQuantity: item.requestedQuantity,
          requestedUM: item.requestedUM,
          unit: (item.requestedUM === "box" ? "box" : "unit") as "unit" | "box",
          status: "pending" as const,
        }));

        await db.insert(pickingOrderItems).values(orderItems);

        // Atualizar totais
        await db
          .update(pickingOrders)
          .set({
            totalItems: input.items.length,
            totalQuantity: input.items.reduce((sum, item) => sum + item.requestedQuantity, 0),
          })
          .where(eq(pickingOrders.id, input.orderId));
      }

      return {
        success: true,
        message: "Pedido atualizado com sucesso!",
      };
    }),

  /**
   * Endpoint para cancelar pedido pendente.
   * Apenas pedidos com status "pending" podem ser cancelados.
   */
  cancelPickingOrder: publicProcedure
    .input(
      z.object({
        orderId: z.number(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const session = await getPortalSession(ctx.req);

      // Verificar se pedido existe e pertence ao tenant
      const order = await db
        .select()
        .from(pickingOrders)
        .where(
          and(
            eq(pickingOrders.id, input.orderId),
            eq(pickingOrders.tenantId, session.tenantId)
          )
        )
        .limit(1);

      if (order.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
      }

      if (order[0].status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas pedidos pendentes podem ser cancelados." });
      }

      // Cancelar pedido
      await db
        .update(pickingOrders)
        .set({
          status: "cancelled",
          notes: input.reason ? `${order[0].notes || ""}

Motivo do cancelamento: ${input.reason}`.trim() : order[0].notes,
        })
        .where(eq(pickingOrders.id, input.orderId));

      // Cancelar itens
      await db
        .update(pickingOrderItems)
        .set({ status: "cancelled" })
        .where(eq(pickingOrderItems.pickingOrderId, input.orderId));

      return {
        success: true,
        message: "Pedido cancelado com sucesso!",
      };
    }),

  // Importar pedidos em lote via Excel
  importOrders: publicProcedure
    .input(
      z.object({
        fileData: z.string(), // Base64 do arquivo Excel
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const session = await getPortalSession(ctx.req);

      try {
        // Decodificar base64 e processar Excel
        const buffer = Buffer.from(input.fileData, 'base64');
        const xlsx = await import('xlsx');
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows: any[] = xlsx.utils.sheet_to_json(sheet);

        if (rows.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Planilha vazia" });
        }

        const results = {
          success: [] as any[],
          errors: [] as any[],
        };

        // Agrupar por número do pedido
        const orderGroups = new Map<string, any[]>();
        
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const rowNum = i + 2; // +2 porque linha 1 é cabeçalho e array começa em 0

          // Validar campos obrigatórios
          if (!row['Nº do Pedido']) {
            results.errors.push({ linha: rowNum, erro: 'Nº do Pedido é obrigatório' });
            continue;
          }
          if (!row['Cód. do Produto']) {
            results.errors.push({ linha: rowNum, erro: 'Cód. do Produto é obrigatório' });
            continue;
          }
          if (!row['Quantidade'] || row['Quantidade'] <= 0) {
            results.errors.push({ linha: rowNum, erro: 'Quantidade deve ser maior que zero' });
            continue;
          }
          if (!row['Unidade de Medida']) {
            results.errors.push({ linha: rowNum, erro: 'Unidade de Medida é obrigatória' });
            continue;
          }

          const orderNumber = String(row['Nº do Pedido']).trim();
          if (!orderGroups.has(orderNumber)) {
            orderGroups.set(orderNumber, []);
          }
          orderGroups.get(orderNumber)!.push({ ...row, rowNum });
        }

        // Processar cada pedido
        for (const [orderNumber, items] of Array.from(orderGroups.entries())) {
          try {
            // PASSO 1: Validar produtos e estoque
            const stockValidations: Array<{
              productId: number;
              product: any;
              availableStock: any[];
              quantityInUnits: number;
              requestedUM: "box" | "unit";
            }> = [];

            let hasItemError = false;
            for (const item of items) {
              const productCode = String(item['Cód. do Produto']).trim();
              const quantity = Number(item['Quantidade']);
              const unit = String(item['Unidade de Medida']).toLowerCase().trim();

              // Buscar produto por SKU
              const [product] = await db
                .select()
                .from(products)
                .where(
                  and(
                    eq(products.tenantId, session.tenantId),
                    sql`LOWER(${products.sku}) = LOWER(${productCode})`
                  )
                )
                .limit(1);

              if (!product) {
                results.errors.push({
                  pedido: orderNumber,
                  linha: item.rowNum,
                  erro: `Produto "${productCode}" não encontrado`,
                });
                hasItemError = true;
                break;
              }

              // Validar unidade de medida
              let requestedUM: "box" | "unit";
              if (unit === "caixa" || unit === "box") {
                requestedUM = "box";
              } else if (unit === "unidade" || unit === "unit" || unit === "un") {
                requestedUM = "unit";
              } else {
                results.errors.push({
                  pedido: orderNumber,
                  linha: item.rowNum,
                  erro: `Unidade de medida "${unit}" inválida. Use: caixa ou unidade`,
                });
                hasItemError = true;
                break;
              }

              // Converter quantidade para unidades
              let quantityInUnits = quantity;
              if (requestedUM === "box") {
                if (!product.unitsPerBox || product.unitsPerBox <= 0) {
                  results.errors.push({
                    pedido: orderNumber,
                    linha: item.rowNum,
                    erro: `Produto ${product.sku} não possui quantidade por caixa configurada`,
                  });
                  hasItemError = true;
                  break;
                }
                quantityInUnits = quantity * product.unitsPerBox;
              }

              // Buscar estoque disponível (FEFO)
              const availableStock = await db
                .select({
                  id: inventory.id,
                  locationId: inventory.locationId,
                  locationCode: warehouseLocations.code,
                  quantity: inventory.quantity,
                  reservedQuantity: inventory.reservedQuantity,
                  batch: inventory.batch,
                  expiryDate: inventory.expiryDate,
                  labelCode: inventory.labelCode,
                  availableQuantity: sql<number>`${inventory.quantity} - ${inventory.reservedQuantity}`.as('availableQuantity'),
                })
                .from(inventory)
                .leftJoin(warehouseLocations, eq(inventory.locationId, warehouseLocations.id))
                .leftJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
                .where(
                  and(
                    eq(inventory.tenantId, session.tenantId),
                    eq(inventory.productId, product.id),
                    eq(inventory.status, "available"),
                    sql`${inventory.quantity} - ${inventory.reservedQuantity} > 0`,
                    sql`${warehouseZones.code} NOT IN ('EXP', 'REC', 'NCG', 'DEV')`
                  )
                )
                .orderBy(inventory.expiryDate); // FEFO

              // Calcular total disponível
              const totalAvailable = availableStock.reduce((sum, loc) => sum + loc.availableQuantity, 0);
              
              if (totalAvailable < quantityInUnits) {
                results.errors.push({
                  pedido: orderNumber,
                  linha: item.rowNum,
                  erro: `Estoque insuficiente para ${product.sku}. Disponível: ${totalAvailable} un, Solicitado: ${quantityInUnits} un`,
                });
                hasItemError = true;
                break;
              }

              stockValidations.push({
                productId: product.id,
                product,
                availableStock,
                quantityInUnits,
                requestedUM,
              });
            }

            if (hasItemError) {
              continue;
            }

            // PASSO 2: Criar pedido
            const totalQuantityInUnits = stockValidations.reduce((sum, val) => sum + val.quantityInUnits, 0);

            const [order] = await db.insert(pickingOrders).values({
              tenantId: session.tenantId,
              orderNumber,
              customerOrderNumber: orderNumber,
              status: "pending",
              priority: "normal",
              totalItems: stockValidations.length,
              totalQuantity: totalQuantityInUnits,
              createdBy: session.systemUserId,
            });

            const orderId = Number(order.insertId);

            // PASSO 3: Criar itens e reservar estoque
            // CORREÇÃO BUG #2: Criar pickingOrderItems SEPARADOS POR LOTE
            for (const validation of stockValidations) {
              const { productId, product, availableStock, quantityInUnits, requestedUM } = validation;

              // Reservar estoque e criar um pickingOrderItem para CADA LOTE
              let remainingToReserve = quantityInUnits;
              for (const stock of availableStock) {
                if (remainingToReserve <= 0) break;

                const toReserve = Math.min(stock.availableQuantity, remainingToReserve);
                
                // Incrementar reservedQuantity no inventory
                await db
                  .update(inventory)
                  .set({
                    reservedQuantity: sql`${inventory.reservedQuantity} + ${toReserve}`
                  })
                  .where(eq(inventory.id, stock.id));

                // ✅ CRIAR pickingOrderItem PARA ESTE LOTE ESPECÍFICO
                await db.insert(pickingOrderItems).values({
                  pickingOrderId: orderId,
                  productId,
                  requestedQuantity: toReserve, // ✅ Quantidade deste lote
                  requestedUM: "unit",
                  unit: (requestedUM === "box" ? "box" : "unit") as "unit" | "box",
                  unitsPerBox: requestedUM === "box" ? product.unitsPerBox : undefined,
                  batch: stock.batch, // ✅ Lote específico
                  expiryDate: stock.expiryDate, // ✅ Validade
                  inventoryId: stock.id, // ✅ Vínculo com inventário
                  status: "pending" as const,
                  uniqueCode: getUniqueCode(product.sku, stock.batch), // ✅ Adicionar uniqueCode
                });

                // ✅ CRIAR pickingAllocation para este lote
                await db.insert(pickingAllocations).values({
                  pickingOrderId: orderId,
                  productId,
                  productSku: product.sku,
                  locationId: stock.locationId,
                  locationCode: stock.locationCode ?? "",
                  batch: stock.batch,
                  expiryDate: stock.expiryDate ?? null,
                  uniqueCode: getUniqueCode(product.sku, stock.batch),
                  labelCode: stock.labelCode,
                  quantity: toReserve,
                  isFractional: false,
                  sequence: 0,
                  status: "pending",
                  pickedQuantity: 0,
                });

                remainingToReserve -= toReserve;
              }
            }

            results.success.push({
              pedido: orderNumber,
              numeroSistema: `#${orderId}`,
              itens: stockValidations.length,
              quantidadeTotal: totalQuantityInUnits,
            });
          } catch (error: any) {
            results.errors.push({
              pedido: orderNumber,
              erro: error.message || "Erro ao processar pedido",
            });
          }
        }

        return results;
      } catch (error: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message || "Erro ao processar arquivo",
        });
      }
    }),
});
