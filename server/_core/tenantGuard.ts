/**
 * tenantGuard.ts
 * ============================================================================
 * Utilitário central de isolamento multi-tenant para o WMS Med@x.
 *
 * Regras de negócio:
 *  - Usuários comuns: effectiveTenantId = ctx.user.tenantId (imutável, vindo do JWT)
 *  - Global Admin (role='admin'): pode passar input.tenantId para operar em nome
 *    de qualquer tenant (suporte / auditoria). Não há restrição de tenantId.
 *  - Se effectiveTenantId não puder ser determinado, lança FORBIDDEN.
 *
 * Uso:
 *   import { tenantProcedure } from "./_core/tenantGuard";
 *
 *   export const myRouter = router({
 *     list: tenantProcedure
 *       .input(z.object({ ... }))
 *       .query(async ({ input, ctx }) => {
 *         // ctx.effectiveTenantId é sempre seguro aqui
 *         // ctx.isGlobalAdmin é true para qualquer usuário com role='admin'
 *       }),
 *   });
 *
 * Utilitário de query helper:
 *   import { tenantFilter } from "./_core/tenantGuard";
 *   .where(tenantFilter(table, ctx.effectiveTenantId))
 * ============================================================================
 */

import { TRPCError, initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { eq, and, type SQL } from "drizzle-orm";

// ─── Tipo estendido do contexto com tenant resolvido ─────────────────────────

export type TenantContext = Omit<TrpcContext, "user"> & {
  /** Usuário autenticado (garantidamente não-nulo após o middleware) */
  user: NonNullable<TrpcContext["user"]>;
  /** tenantId efetivo para esta requisição (nunca nulo após o middleware) */
  effectiveTenantId: number;
  /** true para qualquer usuário com role='admin' (independente do tenantId) */
  isGlobalAdmin: boolean;
};

// ─── Middleware de resolução de tenant ───────────────────────────────────────

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });

/**
 * Resolve o effectiveTenantId a partir do contexto autenticado.
 * Aceita input.tenantId apenas para Global Admins.
 */
export const resolveTenant = t.middleware(async ({ ctx, next, input }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Autenticação necessária." });
  }

  // Global Admin = qualquer usuário com role='admin', independente do tenantId
  const isGlobalAdmin = ctx.user.role === "admin";

  // Para Global Admin, permite sobrescrever com input.tenantId
  let effectiveTenantId: number | null | undefined = ctx.user.tenantId;

  if (isGlobalAdmin) {
    const raw = input as Record<string, unknown> | null | undefined;
    const inputTenantId =
      raw && typeof raw === "object" && typeof raw["tenantId"] === "number"
        ? (raw["tenantId"] as number)
        : null;
    if (inputTenantId) {
      // Admin pode sobrescrever o tenant efetivo via input.tenantId
      effectiveTenantId = inputTenantId;
    }
    // Global Admin sem input.tenantId: effectiveTenantId permanece o seu próprio,
    // mas as queries devem usar isGlobalAdmin=true para omitir o filtro de tenant
  }

  if (!isGlobalAdmin && !effectiveTenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Usuário sem tenant associado. Contate o administrador.",
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      effectiveTenantId: effectiveTenantId as number,
      isGlobalAdmin,
    } as TenantContext,
  });
});

// ─── Procedure com tenant resolvido ──────────────────────────────────────────

/**
 * Use `tenantProcedure` em lugar de `protectedProcedure` para qualquer
 * endpoint que precise de isolamento de dados por tenant.
 * O contexto resultante expõe `ctx.effectiveTenantId` e `ctx.isGlobalAdmin`.
 */
export const tenantProcedure = t.procedure.use(resolveTenant);

// ─── Helper de filtro SQL ─────────────────────────────────────────────────────

/**
 * Retorna a condição SQL de filtro por tenant para uso em `.where()`.
 *
 * @param tenantIdCol  Coluna tenantId da tabela Drizzle (ex: inventory.tenantId)
 * @param effectiveTenantId  Valor resolvido de ctx.effectiveTenantId
 * @param isGlobalAdmin  Se true e effectiveTenantId for 0/undefined, omite o filtro
 *
 * Exemplo:
 *   .where(tenantFilter(inventory.tenantId, ctx.effectiveTenantId, ctx.isGlobalAdmin))
 */
export function tenantFilter(
  tenantIdCol: Parameters<typeof eq>[0],
  effectiveTenantId: number | null | undefined,
  isGlobalAdmin = false
): SQL | undefined {
  if (!effectiveTenantId && isGlobalAdmin) {
    // Admin global sem tenant específico: sem filtro (visão global)
    return undefined;
  }
  if (!effectiveTenantId) {
    // Segurança: nunca retornar dados sem tenant
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Tenant não resolvido. Acesso negado.",
    });
  }
  return eq(tenantIdCol, effectiveTenantId);
}

/**
 * Valida que um resourceTenantId pertence ao effectiveTenantId do usuário.
 * Lança FORBIDDEN se houver tentativa de acesso cross-tenant.
 *
 * @param resourceTenantId  tenantId do recurso sendo acessado
 * @param effectiveTenantId  tenantId efetivo do usuário
 * @param isGlobalAdmin  Admins globais podem acessar qualquer tenant
 * @param resourceName  Nome descritivo para mensagem de erro
 */
export function assertSameTenant(
  resourceTenantId: number | null | undefined,
  effectiveTenantId: number,
  isGlobalAdmin: boolean,
  resourceName = "recurso"
): void {
  if (isGlobalAdmin) return; // Admin global: acesso irrestrito
  if (resourceTenantId !== effectiveTenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Acesso negado: ${resourceName} pertence a outro tenant.`,
    });
  }
}
