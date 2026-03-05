import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  console.log("--- DEBUG TRPC CONTEXT START ---");
  console.log("Headers Authorization:", opts.req.headers['authorization'] ? "Presente" : "Ausente");
  console.log("Headers Cookie:", opts.req.headers['cookie'] ? "Presente (" + opts.req.headers['cookie'].substring(0, 50) + "...)" : "Ausente");

  let user: User | null = null;

  // Desabilitar autenticação durante testes E2E
  if (process.env.E2E_TESTING === 'true') {
    console.log("E2E_TESTING mode: Usando usuário mock");
    // Criar usuário mock para testes
    user = {
      id: 1,
      openId: 'e2e-test-user',
      name: 'E2E Test User',
      role: 'admin',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User;
  } else {
    try {
      user = await sdk.authenticateRequest(opts.req);
      console.log("Sessão encontrada:", user ? "SIM" : "NÃO");
      if (user) {
        console.log("User ID:", user.id);
        console.log("User Name:", user.name);
        console.log("User Role:", user.role);
        console.log("Tenant ID:", (user as any).tenantId || "NÃO DEFINIDO");
      }
    } catch (error) {
      console.error("ERRO AO AUTENTICAR:", error);
      // Authentication is optional for public procedures.
      user = null;
    }
  }

  console.log("--- DEBUG TRPC CONTEXT END ---");

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
