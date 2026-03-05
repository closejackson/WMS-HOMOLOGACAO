import { getDb } from "../db";
import { divergenceApprovals } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export async function approveDivergence(
  receivingOrderItemId: number,
  userId: number,
  divergenceType: "quantity" | "code_mismatch" | "expiry_date" | "multiple",
  divergenceDetails: string,
  justification: string,
  approvalJustification?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(divergenceApprovals).values({
    receivingOrderItemId,
    requestedBy: userId,
    divergenceType,
    divergenceDetails,
    justification,
    status: "approved",
    approvedBy: userId,
    approvalJustification: approvalJustification || null,
    approvedAt: new Date(),
  });
  
  return result;
}

export async function rejectDivergence(
  receivingOrderItemId: number,
  userId: number,
  divergenceType: "quantity" | "code_mismatch" | "expiry_date" | "multiple",
  divergenceDetails: string,
  justification: string,
  approvalJustification?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(divergenceApprovals).values({
    receivingOrderItemId,
    requestedBy: userId,
    divergenceType,
    divergenceDetails,
    justification,
    status: "rejected",
    approvedBy: userId,
    approvalJustification: approvalJustification || null,
    approvedAt: new Date(),
  });
  
  return result;
}
