import { TRPCError } from "@trpc/server";
import { eq, inArray, and } from "drizzle-orm";
import { getDb } from "../db.ts";
import { userRoles, rolePermissions, permissions } from "../../drizzle/schema.ts";

/**
 * Verifica se um usuário tem uma permissão específica
 * @param userId ID do usuário
 * @param permissionCode Código da permissão (ex: "admin:manage_users")
 * @returns true se o usuário tem a permissão, false caso contrário
 */
export async function hasPermission(userId: number, permissionCode: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

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
    .select({ id: permissions.id })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(
      and(
        inArray(rolePermissions.roleId, roleIds),
        eq(permissions.code, permissionCode)
      )
    )
    .limit(1);

  return result.length > 0;
}

/**
 * Busca todas as permissões de um usuário em uma única query (evita N+1)
 */
async function getUserPermissionCodes(userId: number): Promise<Set<string>> {
  const db = await getDb();
  if (!db) return new Set();

  const userRolesResult = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));

  if (userRolesResult.length === 0) return new Set();

  const roleIds = userRolesResult.map(r => r.roleId);

  const result = await db
    .select({ code: permissions.code })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(inArray(rolePermissions.roleId, roleIds));

  return new Set(result.map(r => r.code));
}

/**
 * Verifica se um usuário tem TODAS as permissões especificadas
 * Usa uma única query ao banco ao invés de N queries (evita N+1)
 * @param userId ID do usuário
 * @param permissionCodes Array de códigos de permissões
 * @returns true se o usuário tem todas as permissões, false caso contrário
 */
export async function hasAllPermissions(userId: number, permissionCodes: string[]): Promise<boolean> {
  if (permissionCodes.length === 0) return true;
  const userPerms = await getUserPermissionCodes(userId);
  return permissionCodes.every(code => userPerms.has(code));
}

/**
 * Verifica se um usuário tem ALGUMA das permissões especificadas
 * Usa uma única query ao banco ao invés de N queries (evita N+1)
 * @param userId ID do usuário
 * @param permissionCodes Array de códigos de permissões
 * @returns true se o usuário tem pelo menos uma das permissões, false caso contrário
 */
export async function hasAnyPermission(userId: number, permissionCodes: string[]): Promise<boolean> {
  if (permissionCodes.length === 0) return false;
  const userPerms = await getUserPermissionCodes(userId);
  return permissionCodes.some(code => userPerms.has(code));
}

/**
 * Middleware para proteger procedures com verificação de permissão
 * Lança erro se o usuário não tiver a permissão
 * @param userId ID do usuário
 * @param permissionCode Código da permissão requerida
 * @throws TRPCError com código FORBIDDEN se o usuário não tiver a permissão
 */
export async function requirePermission(userId: number, permissionCode: string): Promise<void> {
  const allowed = await hasPermission(userId, permissionCode);
  
  if (!allowed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Você não tem permissão para executar esta ação. Permissão necessária: ${permissionCode}`,
    });
  }
}

/**
 * Middleware para proteger procedures que requerem TODAS as permissões
 * @param userId ID do usuário
 * @param permissionCodes Array de códigos de permissões requeridas
 * @throws TRPCError com código FORBIDDEN se o usuário não tiver todas as permissões
 */
export async function requireAllPermissions(userId: number, permissionCodes: string[]): Promise<void> {
  const allowed = await hasAllPermissions(userId, permissionCodes);
  
  if (!allowed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Você não tem todas as permissões necessárias para executar esta ação. Permissões necessárias: ${permissionCodes.join(", ")}`,
    });
  }
}

/**
 * Middleware para proteger procedures que requerem ALGUMA das permissões
 * @param userId ID do usuário
 * @param permissionCodes Array de códigos de permissões (qualquer uma serve)
 * @throws TRPCError com código FORBIDDEN se o usuário não tiver nenhuma das permissões
 */
export async function requireAnyPermission(userId: number, permissionCodes: string[]): Promise<void> {
  const allowed = await hasAnyPermission(userId, permissionCodes);
  
  if (!allowed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Você não tem permissão para executar esta ação. Permissões aceitas: ${permissionCodes.join(", ")}`,
    });
  }
}

/**
 * Busca todas as permissões de um usuário (agregadas de todos os perfis)
 * @param userId ID do usuário
 * @returns Array de códigos de permissões
 */
export async function getUserPermissions(userId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];

  // Buscar todos os perfis do usuário
  const userRolesResult = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));

  if (userRolesResult.length === 0) {
    return [];
  }

  const roleIds = userRolesResult.map(r => r.roleId);

  // Buscar todas as permissões desses perfis
  const result = await db
    .select({ code: permissions.code })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(inArray(rolePermissions.roleId, roleIds));

  // Remover duplicatas
  return Array.from(new Set(result.map(r => r.code)));
}
