import { eq, and, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, 
  users, 
  tenants, 
  contracts, 
  products,
  warehouses,
  warehouseZones,
  warehouseLocations,
  receivingOrders,
  receivingOrderItems,
  inventory,
  inventoryMovements,
  pickingOrders,
  pickingOrderItems,
  shipments,
  inventoryCounts,
  inventoryCountItems,
  recalls,
  returns,
  auditLogs
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============================================================================
// TENANTS (CLIENTES)
// ============================================================================

export async function getAllTenants() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(tenants).orderBy(desc(tenants.createdAt)).limit(1000);
}

export async function getTenantById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  return result[0] || null;
}

export async function createTenant(data: typeof tenants.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(tenants).values(data);
  return result;
}

export async function updateTenant(id: number, data: Partial<typeof tenants.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(tenants).set(data).where(eq(tenants.id, id));
}

export async function deleteTenant(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Soft delete: atualizar status ao invés de deletar fisicamente
  // Mantém rastreabilidade e conformidade com ANVISA (RDC 430/2020)
  await db.update(tenants).set({ status: "inactive" }).where(eq(tenants.id, id));
}

// ============================================================================
// CONTRACTS
// ============================================================================

export async function getContractsByTenant(tenantId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(contracts).where(eq(contracts.tenantId, tenantId)).orderBy(desc(contracts.createdAt));
}

export async function createContract(data: typeof contracts.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(contracts).values(data);
  return result;
}

export async function updateContract(id: number, data: Partial<typeof contracts.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(contracts).set(data).where(eq(contracts.id, id));
}

// ============================================================================
// PRODUCTS
// ============================================================================

export async function getAllProducts(tenantId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  
  if (tenantId) {
    return await db.select().from(products).where(eq(products.tenantId, tenantId)).orderBy(desc(products.createdAt)).limit(1000);
  }
  
  return await db.select().from(products).orderBy(desc(products.createdAt)).limit(1000);
}

export async function getProductById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return result[0] || null;
}

export async function createProduct(data: typeof products.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(products).values(data);
  return result;
}

export async function updateProduct(id: number, data: Partial<typeof products.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(products).set(data).where(eq(products.id, id));
}

export async function deleteProduct(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Soft delete: atualizar status ao invés de deletar fisicamente
  // Mantém rastreabilidade e conformidade com ANVISA (RDC 430/2020)
  await db.update(products).set({ status: "discontinued" }).where(eq(products.id, id));
}

// ============================================================================
// WAREHOUSES
// ============================================================================

export async function getAllWarehouses() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(warehouses).orderBy(desc(warehouses.createdAt));
}

export async function createWarehouse(data: typeof warehouses.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(warehouses).values(data);
  return result;
}

// ============================================================================
// RECEIVING ORDERS
// ============================================================================

export async function getAllReceivingOrders(tenantId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  
  if (tenantId) {
    return await db.select().from(receivingOrders).where(eq(receivingOrders.tenantId, tenantId)).orderBy(desc(receivingOrders.createdAt)).limit(500);
  }
  
  return await db.select().from(receivingOrders).orderBy(desc(receivingOrders.createdAt)).limit(500);
}

export async function createReceivingOrder(data: typeof receivingOrders.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(receivingOrders).values(data);
  return result;
}

export async function updateReceivingOrder(id: number, data: Partial<typeof receivingOrders.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(receivingOrders).set(data).where(eq(receivingOrders.id, id));
}

// ============================================================================
// PICKING ORDERS
// ============================================================================

export async function getAllPickingOrders(tenantId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  
  if (tenantId) {
    return await db.select().from(pickingOrders).where(eq(pickingOrders.tenantId, tenantId)).orderBy(desc(pickingOrders.createdAt)).limit(500);
  }
  
  return await db.select().from(pickingOrders).orderBy(desc(pickingOrders.createdAt)).limit(500);
}

export async function createPickingOrder(data: typeof pickingOrders.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(pickingOrders).values(data);
  return result;
}

export async function updatePickingOrder(id: number, data: Partial<typeof pickingOrders.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(pickingOrders).set(data).where(eq(pickingOrders.id, id));
}

// ============================================================================
// INVENTORY
// ============================================================================

export async function getInventory(tenantId?: number) {
  const db = await getDb();
  if (!db) return [];
  
  if (tenantId) {
    return await db.select().from(inventory).where(eq(inventory.tenantId, tenantId)).orderBy(desc(inventory.createdAt));
  }
  
  return await db.select().from(inventory).orderBy(desc(inventory.createdAt));
}

export async function createInventoryRecord(data: typeof inventory.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(inventory).values(data);
  return result;
}

export async function updateInventoryRecord(id: number, data: Partial<typeof inventory.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(inventory).set(data).where(eq(inventory.id, id));
}

// ============================================================================
// AUDIT LOGS
// ============================================================================

export async function createAuditLog(data: typeof auditLogs.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(auditLogs).values(data);
  return result;
}

export async function getAuditLogs(tenantId?: number, limit: number = 100) {
  const db = await getDb();
  if (!db) return [];
  
  if (tenantId) {
    return await db.select().from(auditLogs).where(eq(auditLogs.tenantId, tenantId)).orderBy(desc(auditLogs.createdAt)).limit(limit);
  }
  
  return await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
}

// ============================================================================
// TEST UTILITIES
// ============================================================================

export async function deleteLocationsByAisle(aisle: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(warehouseLocations).where(eq(warehouseLocations.aisle, aisle));
}
