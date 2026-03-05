import { getDb } from "../db";

export async function getReceivingLocation(tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // TODO: Implementar lógica de busca de endereço de recebimento
  // Por enquanto retorna ID fixo (1)
  return 1;
}
