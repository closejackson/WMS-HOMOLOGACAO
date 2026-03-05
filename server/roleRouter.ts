import { z } from "zod";
import { eq, and, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc.ts";
import { getDb } from "./db.ts";
import { roles, permissions, rolePermissions, userRoles } from "../drizzle/schema.ts";

/**
 * Router para gerenciamento de perfis e permissões (RBAC)
 */
export const roleRouter = router({
  /**
   * Listar todos os perfis
   */
  listRoles: protectedProcedure
    .input(z.object({
      includeInactive: z.boolean().optional(),
    }))
    .query(async ({ input, ctx }) => {
      // Apenas admins podem listar perfis
      if (ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas administradores podem acessar perfis",
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Buscar perfis com contagem de permissões
      const rolesData = await db
        .select({
          id: roles.id,
          code: roles.code,
          name: roles.name,
          description: roles.description,
          isSystemRole: roles.isSystemRole,
          active: roles.active,
          createdAt: roles.createdAt,
          updatedAt: roles.updatedAt,
          permissionCount: sql<number>`CAST(COUNT(DISTINCT ${rolePermissions.permissionId}) AS UNSIGNED)`,
        })
        .from(roles)
        .leftJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
        .where(input.includeInactive ? undefined : eq(roles.active, true))
        .groupBy(roles.id);

      return rolesData;
    }),

  /**
   * Listar todas as permissões
   */
  listPermissions: protectedProcedure
    .input(z.object({
      module: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      // Apenas admins podem listar permissões
      if (ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas administradores podem acessar permissões",
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      if (input.module) {
        return await db.select().from(permissions)
          .where(and(eq(permissions.active, true), eq(permissions.module, input.module)));
      }

      return await db.select().from(permissions).where(eq(permissions.active, true));
    }),

  /**
   * Obter permissões de um perfil
   */
  getRolePermissions: protectedProcedure
    .input(z.object({
      roleId: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      // Apenas admins podem visualizar permissões de perfis
      if (ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas administradores podem acessar permissões de perfis",
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const result = await db
        .select({
          permission: permissions,
        })
        .from(rolePermissions)
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(eq(rolePermissions.roleId, input.roleId));

      return result.map(r => r.permission);
    }),

  /**
   * Obter perfis de um usuário
   */
  getUserRoles: protectedProcedure
    .input(z.object({
      userId: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      // Apenas admins podem visualizar perfis de usuários
      if (ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas administradores podem acessar perfis de usuários",
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const result = await db
        .select({
          role: roles,
          assignedAt: userRoles.createdAt,
        })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, input.userId));

      return result;
    }),

  /**
   * Obter todas as permissões de um usuário (agregadas de todos os perfis)
   */
  getUserPermissions: protectedProcedure
    .input(z.object({
      userId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Buscar todos os perfis do usuário
      const userRolesResult = await db
        .select({ roleId: userRoles.roleId })
        .from(userRoles)
        .where(eq(userRoles.userId, input.userId));

      if (userRolesResult.length === 0) {
        return [];
      }

      const roleIds = userRolesResult.map(r => r.roleId);

      // Buscar todas as permissões desses perfis
      const result = await db
        .select({
          permission: permissions,
        })
        .from(rolePermissions)
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(inArray(rolePermissions.roleId, roleIds));

      // Remover duplicatas (caso usuário tenha múltiplos perfis com mesma permissão)
      const uniquePermissions = Array.from(
        new Map(result.map(r => [r.permission.id, r.permission])).values()
      );

      return uniquePermissions;
    }),

  /**
   * Atribuir perfis a um usuário
   */
  assignRolesToUser: protectedProcedure
    .input(z.object({
      userId: z.number(),
      roleIds: z.array(z.number()),
    }))
    .mutation(async ({ input, ctx }) => {
      // Apenas admins podem atribuir perfis
      if (ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas administradores podem atribuir perfis",
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Remover perfis atuais
      await db.delete(userRoles).where(eq(userRoles.userId, input.userId));

      // Adicionar novos perfis
      if (input.roleIds.length > 0) {
        const values = input.roleIds.map(roleId => ({
          userId: input.userId,
          roleId,
          assignedBy: ctx.user.id,
        }));

        await db.insert(userRoles).values(values);
      }

      return { success: true };
    }),

  /**
   * Atualizar permissões de um perfil
   */
  updateRolePermissions: protectedProcedure
    .input(z.object({
      roleId: z.number(),
      permissionIds: z.array(z.number()),
    }))
    .mutation(async ({ input, ctx }) => {
      // Apenas admins podem atualizar permissões de perfis
      if (ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas administradores podem atualizar permissões de perfis",
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Verificar se é perfil do sistema (não pode ser editado)
      const role = await db.select().from(roles).where(eq(roles.id, input.roleId)).limit(1);
      
      if (role.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Perfil não encontrado",
        });
      }

      if (role[0].isSystemRole) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Perfis do sistema não podem ser editados",
        });
      }

      // Remover permissões atuais
      await db.delete(rolePermissions).where(eq(rolePermissions.roleId, input.roleId));

      // Adicionar novas permissões
      if (input.permissionIds.length > 0) {
        const values = input.permissionIds.map(permissionId => ({
          roleId: input.roleId,
          permissionId,
        }));

        await db.insert(rolePermissions).values(values);
      }

      return { success: true };
    }),

  /**
   * Verificar se usuário tem permissão específica
   */
  checkPermission: protectedProcedure
    .input(z.object({
      userId: z.number().optional(), // Se não informado, verifica o próprio usuário
      permissionCode: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      const userId = input.userId || ctx.user.id;

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Buscar todos os perfis do usuário
      const userRolesResult = await db
        .select({ roleId: userRoles.roleId })
        .from(userRoles)
        .where(eq(userRoles.userId, userId));

      if (userRolesResult.length === 0) {
        return false;
      }

      const roleIds = userRolesResult.map(r => r.roleId);

      // Verificar se algum dos perfis tem a permissão
      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(rolePermissions)
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(
          and(
            inArray(rolePermissions.roleId, roleIds),
            eq(permissions.code, input.permissionCode)
          )
        );

      return result[0].count > 0;
    }),
});
