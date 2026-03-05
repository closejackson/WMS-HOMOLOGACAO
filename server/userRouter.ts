import { z } from "zod";
import { eq, like, or, and, isNull, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { users, tenants, userRoles } from "../drizzle/schema";
import { protectedProcedure, router } from "./_core/trpc";

/**
 * User Management Router
 * Handles CRUD operations for user management
 * Restricted to admin users only
 */

// Admin-only middleware
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Apenas administradores podem acessar esta funcionalidade",
    });
  }
  return next({ ctx });
});

export const userRouter = router({
  /**
   * List all users with optional filters
   */
  list: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        role: z.enum(["admin", "user"]).optional(),
        tenantId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const { search, role, tenantId } = input;

      const conditions = [];

      if (search) {
        conditions.push(
          or(
            like(users.name, `%${search}%`),
            like(users.email, `%${search}%`)
          )
        );
      }

      if (role) {
        conditions.push(eq(users.role, role));
      }

      if (tenantId !== undefined) {
        if (tenantId === 0) {
          // Filter users without tenant
          conditions.push(isNull(users.tenantId));
        } else {
          conditions.push(eq(users.tenantId, tenantId));
        }
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const userList = await db
        .select({
          id: users.id,
          openId: users.openId,
          name: users.name,
          email: users.email,
          role: users.role,
          tenantId: users.tenantId,
          tenantName: tenants.name,
          loginMethod: users.loginMethod,
          createdAt: users.createdAt,
          lastSignedIn: users.lastSignedIn,
        })
        .from(users)
        .leftJoin(tenants, eq(users.tenantId, tenants.id))
        .where(whereClause)
        .orderBy(desc(users.createdAt));

      return userList;
    }),

  /**
   * Create new user
   */
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1, "Nome é obrigatório"),
        email: z.string().email("Email inválido"),
        role: z.enum(["admin", "user"]).default("user"),
        tenantId: z.number().nullable().optional(),
        roleIds: z.array(z.number()).optional(), // Perfis RBAC a serem atribuídos
      })
    )
    .mutation(async ({ input }) => {
      const { name, email, role, tenantId, roleIds } = input;

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Check if email already exists
      const [emailExists] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (emailExists) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Este email já está em uso",
        });
      }

      // Create user
      const [newUser] = await db
        .insert(users)
        .values({
          name,
          email,
          role,
          tenantId: tenantId || null,
          loginMethod: "manual", // Usuário criado manualmente pelo admin
          openId: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // OpenID temporário
        });

      const userId = newUser.insertId;

      // Assign RBAC roles if provided
      if (roleIds && roleIds.length > 0) {
        const roleAssignments = roleIds.map(roleId => ({
          userId,
          roleId,
        }));
        await db.insert(userRoles).values(roleAssignments);
      }

      return { 
        success: true, 
        message: "Usuário criado com sucesso",
        userId,
      };
    }),

  /**
   * Get user details by ID
   */
  getById: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const [user] = await db
        .select({
          id: users.id,
          openId: users.openId,
          name: users.name,
          email: users.email,
          role: users.role,
          tenantId: users.tenantId,
          tenantName: tenants.name,
          loginMethod: users.loginMethod,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
          lastSignedIn: users.lastSignedIn,
        })
        .from(users)
        .leftJoin(tenants, eq(users.tenantId, tenants.id))
        .where(eq(users.id, input.id))
        .limit(1);

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Usuário não encontrado",
        });
      }

      return user;
    }),

  /**
   * Update user information
   */
  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1, "Nome é obrigatório").optional(),
        email: z.string().email("Email inválido").optional(),
        role: z.enum(["admin", "user"]).optional(),
        tenantId: z.number().nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input;

      // Prevent self-demotion from admin
      if (ctx.user.id === id && updateData.role === "user") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Você não pode remover seu próprio privilégio de administrador",
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      // Check if user exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!existingUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Usuário não encontrado",
        });
      }

      // Check email uniqueness if email is being updated
      if (updateData.email && updateData.email !== existingUser.email) {
        const [emailExists] = await db
          .select()
          .from(users)
          .where(eq(users.email, updateData.email))
          .limit(1);

        if (emailExists) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Este email já está em uso por outro usuário",
          });
        }
      }

      await db.update(users).set(updateData).where(eq(users.id, id));

      return { success: true, message: "Usuário atualizado com sucesso" };
    }),

  /**
   * Delete user by ID
   * Includes cascade delete of userRoles associations
   */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const { id } = input;

      // Prevent self-deletion
      if (ctx.user.id === id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Você não pode excluir sua própria conta",
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Check if user exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!existingUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Usuário não encontrado",
        });
      }

      // Prevent deletion of system owner
      const ownerOpenId = process.env.OWNER_OPEN_ID;
      if (ownerOpenId && existingUser.openId === ownerOpenId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Não é possível excluir o proprietário do sistema",
        });
      }

      // Cascade delete: remove user role associations first
      await db.delete(userRoles).where(eq(userRoles.userId, id));

      // Delete user
      await db.delete(users).where(eq(users.id, id));

      return { 
        success: true, 
        message: `Usuário ${existingUser.name} excluído com sucesso` 
      };
    }),

  /**
   * Get user statistics
   */
  stats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const allUsers = await db.select().from(users);

    const totalUsers = allUsers.length;
    const adminCount = allUsers.filter((u: typeof allUsers[0]) => u.role === "admin").length;
    const userCount = allUsers.filter((u: typeof allUsers[0]) => u.role === "user").length;
    const usersWithTenant = allUsers.filter((u: typeof allUsers[0]) => u.tenantId !== null).length;
    const usersWithoutTenant = allUsers.filter((u: typeof allUsers[0]) => u.tenantId === null).length;

    return {
      totalUsers,
      adminCount,
      userCount,
      usersWithTenant,
      usersWithoutTenant,
    };
  }),
});
