import { getDb } from "../db";
import { roles, permissions, rolePermissions, userRoles, userPermissions } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export async function getUserPermissions(userId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // TODO: Implementar lógica de busca de permissões do usuário
  return [];
}

export async function hasPermission(userId: number, permissionCode: string): Promise<boolean> {
  const perms = await getUserPermissions(userId);
  return perms.includes(permissionCode);
}

export async function assignRoleToUser(userId: number, roleId: number, assignedBy: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.insert(userRoles).values({
    userId,
    roleId,
    createdBy: assignedBy,
  });
}

export async function grantPermissionToUser(userId: number, permissionId: number, grantedBy: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.insert(userPermissions).values({
    userId,
    permissionId,
    granted: true,
    createdBy: grantedBy,
  });
}
