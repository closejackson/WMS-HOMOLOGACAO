import { getDb } from "./db";
import {
  receivingPreallocations,
  receivingOrderItems,
  receivingOrders,
  warehouseLocations,
  products,
  warehouseZones,
} from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import * as XLSX from "xlsx";
import { getUniqueCode } from "./utils/uniqueCode";

export interface PreallocationRow {
  endereco: string;
  codInterno: string;
  descricao?: string;
  lote: string;
  quantidade: number;
}

export interface PreallocationValidation {
  isValid: boolean;
  row: number;
  endereco: string;
  codInterno: string;
  lote: string;
  quantidade: number;
  errors: string[];
  locationId?: number;
  productId?: number;
}

export interface PreallocationResult {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  validations: PreallocationValidation[];
}

/**
 * Processa arquivo Excel de pré-alocação
 * Aceita variações de cabeçalhos (com/sem acentos, maiúsculas/minúsculas)
 */
export async function processPreallocationExcel(
  fileBuffer: Buffer
): Promise<PreallocationRow[]> {
  // Parsear Excel
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  if (rawRows.length < 2) {
    throw new Error("Planilha vazia ou sem dados");
  }

  // Primeira linha é o cabeçalho
  const headers = (rawRows[0] as string[]).map((h) =>
    String(h || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove acentos
      .replace(/[^a-z0-9]/g, "") // Remove caracteres especiais
  );

  // Mapear índices de colunas (aceita variações)
  const enderecoIdx = headers.findIndex((h) =>
    ["endereco", "endereço", "end"].includes(h)
  );
  const codInternoIdx = headers.findIndex((h) =>
    ["codinterno", "codigointerno", "codigo", "sku"].includes(h)
  );
  const descricaoIdx = headers.findIndex((h) =>
    ["descricao", "descrição", "desc", "produto"].includes(h)
  );
  const loteIdx = headers.findIndex((h) => ["lote", "batch"].includes(h));
  const quantidadeIdx = headers.findIndex((h) =>
    ["quantidade", "qtd", "qty", "quant"].includes(h)
  );

  if (enderecoIdx === -1) {
    throw new Error(
      'Coluna "Endereço" não encontrada. Verifique o cabeçalho da planilha.'
    );
  }
  if (codInternoIdx === -1) {
    throw new Error(
      'Coluna "Cód. Interno" não encontrada. Verifique o cabeçalho da planilha.'
    );
  }
  if (loteIdx === -1) {
    throw new Error(
      'Coluna "Lote" não encontrada. Verifique o cabeçalho da planilha.'
    );
  }
  if (quantidadeIdx === -1) {
    throw new Error(
      'Coluna "Quantidade" não encontrada. Verifique o cabeçalho da planilha.'
    );
  }

  // Processar linhas de dados (pular header)
  const rows: PreallocationRow[] = [];

  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i] as any[];

    // Pular linhas vazias
    if (!row || row.length === 0 || !row[enderecoIdx]) {
      continue;
    }

    const endereco = String(row[enderecoIdx] || "").trim();
    const codInterno = String(row[codInternoIdx] || "").trim();
    const descricao =
      descricaoIdx >= 0 ? String(row[descricaoIdx] || "").trim() : undefined;
    const lote = String(row[loteIdx] || "").trim();
    const quantidade = Number(row[quantidadeIdx]) || 0;

    // Validações básicas
    if (!endereco || !codInterno || !lote || quantidade <= 0) {
      continue; // Pular linha inválida
    }

    rows.push({
      endereco,
      codInterno,
      descricao,
      lote,
      quantidade,
    });
  }

  return rows;
}

/**
 * Valida pré-alocações contra banco de dados
 */
export async function validatePreallocations(
  rows: PreallocationRow[],
  receivingOrderId: number,
  tenantId: number | null
): Promise<PreallocationValidation[]> {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  const validations: PreallocationValidation[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const errors: string[] = [];
    let locationId: number | undefined;
    let productId: number | undefined;

    // 1. Validar formato do código de endereço
    const wholeRegex = /^[A-Z]\d{2}-\d{2}-\d{2}$/; // Ex: T01-01-01
    const fractionRegex = /^[A-Z]\d{2}-\d{2}-\d[A-Z]$/; // Ex: T01-01-1A
    
    if (!wholeRegex.test(row.endereco) && !fractionRegex.test(row.endereco)) {
      errors.push(`Endereço "${row.endereco}" com formato inválido. Use: T01-01-01 (Inteira) ou T01-01-1A (Fração)`);
    }
    
    // 2. Validar se endereço existe no banco
    const locations = await dbConn
      .select()
      .from(warehouseLocations)
      .where(eq(warehouseLocations.code, row.endereco))
      .limit(1);

    if (locations.length === 0) {
      errors.push(`Endereço "${row.endereco}" não encontrado no cadastro`);
    } else {
      locationId = locations[0].id;
      
      // Validar se o formato do código corresponde ao tipo de endereço
      const location = locations[0];
      if (location.locationType === "whole" && !wholeRegex.test(row.endereco)) {
        errors.push(`Endereço "${row.endereco}" é do tipo Inteira, mas o código está em formato de Fração`);
      } else if (location.locationType === "fraction" && !fractionRegex.test(row.endereco)) {
        errors.push(`Endereço "${row.endereco}" é do tipo Fração, mas o código está em formato de Inteira`);
      }
    }

    // 3. Validar produto
    const productsResult = await dbConn
      .select()
      .from(products)
      .where(eq(products.sku, row.codInterno))
      .limit(1);

    if (productsResult.length === 0) {
      errors.push(`Produto "${row.codInterno}" não encontrado`);
    } else {
      productId = productsResult[0].id;
    }

    validations.push({
      isValid: errors.length === 0,
      row: i + 2, // +2 porque linha 1 é header, linhas começam em 1
      endereco: row.endereco,
      codInterno: row.codInterno,
      lote: row.lote,
      quantidade: row.quantidade,
      errors,
      locationId,
      productId,
    });
  }

  return validations;
}

/**
 * Salva pré-alocações válidas no banco de dados
 */
export async function savePreallocations(
  receivingOrderId: number,
  validations: PreallocationValidation[],
  userId: number
): Promise<number> {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  let savedCount = 0;

  for (const validation of validations) {
    if (!validation.isValid || !validation.locationId || !validation.productId) {
      continue;
    }

    await dbConn.insert(receivingPreallocations).values({
      receivingOrderId,
      productId: validation.productId,
      locationId: validation.locationId,
      batch: validation.lote,
      quantity: validation.quantidade,
      status: "pending",
      createdBy: userId,
    });

    savedCount++;
  }

  return savedCount;
}

/**
 * Lista pré-alocações de uma ordem de recebimento
 */
export async function getPreallocations(receivingOrderId: number) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  const preallocations = await dbConn
    .select({
      id: receivingPreallocations.id,
      receivingOrderId: receivingPreallocations.receivingOrderId,
      productId: receivingPreallocations.productId,
      productSku: products.sku,
      productDescription: products.description,
      locationId: receivingPreallocations.locationId,
      code: warehouseLocations.code,
      batch: receivingPreallocations.batch,
      quantity: receivingPreallocations.quantity,
      status: receivingPreallocations.status,
      createdBy: receivingPreallocations.createdBy,
      createdAt: receivingPreallocations.createdAt,
    })
    .from(receivingPreallocations)
    .leftJoin(products, eq(receivingPreallocations.productId, products.id))
    .leftJoin(
      warehouseLocations,
      eq(receivingPreallocations.locationId, warehouseLocations.id)
    )
    .where(eq(receivingPreallocations.receivingOrderId, receivingOrderId));

  return preallocations;
}

/**
 * Deleta pré-alocações de uma ordem de recebimento
 */
export async function deletePreallocations(receivingOrderId: number) {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  await dbConn
    .delete(receivingPreallocations)
    .where(eq(receivingPreallocations.receivingOrderId, receivingOrderId));
}

/**
 * Executa endereçamento: move estoque de REC para endereços finais
 * e registra movimentações de entrada (receiving)
 */
export async function executeAddressing(
  receivingOrderId: number,
  userId: number
): Promise<{ success: boolean; movedItems: number; message: string }> {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database connection failed");

  // Importar schemas necessários
  const { inventory, inventoryMovements } = await import("../drizzle/schema");
  const { eq, and, sql } = await import("drizzle-orm");

  // 1. Buscar ordem de recebimento
  const [order] = await dbConn
    .select()
    .from(receivingOrders)
    .where(eq(receivingOrders.id, receivingOrderId))
    .limit(1);

  if (!order) {
    throw new Error("Ordem de recebimento não encontrada");
  }

  if (order.status !== "addressing") {
    throw new Error(`Ordem não está em status de endereçamento. Status atual: ${order.status}`);
  }

  // 2. Buscar pré-alocações pendentes
  const preallocations = await dbConn
    .select({
      id: receivingPreallocations.id,
      productId: receivingPreallocations.productId,
      locationId: receivingPreallocations.locationId,
      batch: receivingPreallocations.batch,
      quantity: receivingPreallocations.quantity,
      productSku: products.sku,
      productDescription: products.description,
      code: warehouseLocations.code,
    })
    .from(receivingPreallocations)
    .leftJoin(products, eq(receivingPreallocations.productId, products.id))
    .leftJoin(warehouseLocations, eq(receivingPreallocations.locationId, warehouseLocations.id))
    .where(
      and(
        eq(receivingPreallocations.receivingOrderId, receivingOrderId),
        eq(receivingPreallocations.status, "pending")
      )
    );

  if (preallocations.length === 0) {
    throw new Error("Nenhuma pré-alocação pendente encontrada. Importe o arquivo de pré-alocação primeiro.");
  }

  // 3. Buscar endereço REC do tenant
  const recLocations = await dbConn
    .select()
    .from(warehouseLocations)
    .where(
      and(
        sql`${warehouseLocations.code} LIKE '%REC%'`,
        sql`${warehouseLocations.tenantId} = ${order.tenantId}`
      )
    )
    .limit(1);

  if (recLocations.length === 0) {
    throw new Error(`Endereço REC não encontrado para o cliente (tenantId=${order.tenantId})`);
  }

  const recLocationId = recLocations[0].id;
  const recLocationCode = recLocations[0].code;
  let movedItems = 0;

  // 4. Para cada pré-alocação, mover estoque de REC para endereço final
  for (const prealloc of preallocations) {
    // 4.1. Buscar estoque no endereço REC
    const [stockInRec] = await dbConn
      .select()
      .from(inventory)
      .where(
        and(
          eq(inventory.productId, prealloc.productId),
          eq(inventory.locationId, recLocationId),
          prealloc.batch ? eq(inventory.batch, prealloc.batch) : sql`${inventory.batch} IS NULL`,
          eq(inventory.status, "available")
        )
      )
      .limit(1);

    if (!stockInRec) {
      console.warn(`[ENDEREÇAMENTO] Estoque não encontrado em REC para produto ${prealloc.productSku}, lote ${prealloc.batch}. Pulando...`);
      continue;
    }

    if (stockInRec.quantity < prealloc.quantity) {
      console.warn(`[ENDEREÇAMENTO] Estoque insuficiente em REC. Produto: ${prealloc.productSku}, Lote: ${prealloc.batch}, Disponível: ${stockInRec.quantity}, Necessário: ${prealloc.quantity}`);
      // Continuar mesmo assim, movendo o que tem disponível
    }

    const quantityToMove = Math.min(stockInRec.quantity, prealloc.quantity);

    // 4.2. Reduzir estoque no endereço REC
    const newRecQuantity = stockInRec.quantity - quantityToMove;
    
    if (newRecQuantity > 0) {
      await dbConn
        .update(inventory)
        .set({ quantity: newRecQuantity })
        .where(eq(inventory.id, stockInRec.id));
    } else {
      // Se quantidade ficou zero, deletar registro
      await dbConn
        .delete(inventory)
        .where(eq(inventory.id, stockInRec.id));
    }

    // 4.3. Verificar se já existe estoque no endereço final
    const [existingStock] = await dbConn
      .select()
      .from(inventory)
      .where(
        and(
          eq(inventory.productId, prealloc.productId),
          eq(inventory.locationId, prealloc.locationId),
          prealloc.batch ? eq(inventory.batch, prealloc.batch) : sql`${inventory.batch} IS NULL`,
          eq(inventory.status, "available")
        )
      )
      .limit(1);

    if (existingStock) {
      // Incrementar estoque existente
      await dbConn
        .update(inventory)
        .set({ quantity: existingStock.quantity + quantityToMove })
        .where(eq(inventory.id, existingStock.id));
    } else {
      // ✅ VALIDAÇÃO: Verificar se endereço pode receber este lote
      const { validateLocationForBatch } = await import("./locationValidation");
      const validation = await validateLocationForBatch(
        prealloc.locationId,
        prealloc.productId,
        prealloc.batch
      );

      if (!validation.allowed) {
        throw new Error(`Pré-alocação inválida: ${validation.reason}`);
      }

      // Buscar zona do endereço de destino (pré-alocação)
      const destLocation = await dbConn.select({ zoneCode: warehouseZones.code })
        .from(warehouseLocations)
        .innerJoin(warehouseZones, eq(warehouseLocations.zoneId, warehouseZones.id))
        .where(eq(warehouseLocations.id, prealloc.locationId))
        .limit(1);

      // Criar novo registro de estoque
      await dbConn.insert(inventory).values({
        tenantId: order.tenantId,
        productId: prealloc.productId,
        locationId: prealloc.locationId,
        batch: prealloc.batch,
        expiryDate: stockInRec.expiryDate,
        quantity: quantityToMove,
        status: "available",
        uniqueCode: getUniqueCode(prealloc.productSku ?? '', prealloc.batch ?? null), // ✅ Adicionar uniqueCode
        locationZone: destLocation[0]?.zoneCode || null, // ✅ Adicionar locationZone
      });
    }

    // 4.4. Registrar movimentação de ENTRADA (receiving)
    await dbConn.insert(inventoryMovements).values({
      tenantId: order.tenantId,
      productId: prealloc.productId,
      batch: prealloc.batch, // ✅ Adicionar batch
      uniqueCode: getUniqueCode(prealloc.productSku ?? '', prealloc.batch ?? null), // ✅ Adicionar uniqueCode
      movementType: "receiving", // TIPO CORRETO: receiving = entrada
      quantity: quantityToMove,
      fromLocationId: recLocationId, // De: REC
      toLocationId: prealloc.locationId, // Para: Endereço final
      notes: `Endereçamento da ordem ${order.orderNumber} - ${prealloc.productDescription} (Lote: ${prealloc.batch})`,
      performedBy: userId,
      createdAt: new Date(),
    });

    // 4.5. Atualizar status da pré-alocação
    await dbConn
      .update(receivingPreallocations)
      .set({ status: "allocated" })
      .where(eq(receivingPreallocations.id, prealloc.id));

    movedItems++;
    console.log(`[ENDEREÇAMENTO] Movido ${quantityToMove} unidades de ${prealloc.productSku} (${prealloc.batch}) de ${recLocationCode} para ${prealloc.code}`);
  }

  // 5. Atualizar status da ordem para "completed"
  await dbConn
    .update(receivingOrders)
    .set({ status: "completed" })
    .where(eq(receivingOrders.id, receivingOrderId));

  return {
    success: true,
    movedItems,
    message: `Endereçamento concluído com sucesso! ${movedItems} item(ns) movido(s) para endereços finais.`,
  };
}
