/**
 * labelReprintRouter.ts
 * Procedures para reimpressão de etiquetas de todos os tipos do WMS.
 *
 * Tipos suportados:
 *  1. Recebimento   – etiquetas de ordens de recebimento (labelPrintHistory + receivingOrderItems)
 *  2. Separação     – etiquetas de ondas de picking (pickingWaves + pickingOrders)
 *  3. Volumes       – etiquetas de volumes de expedição (shipments)
 *  4. Produtos      – etiquetas de itens individuais (labelAssociations + productLabels)
 *  5. Endereços     – etiquetas de posições de estoque (warehouseLocations)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, like, or, sql } from "drizzle-orm";
import PDFDocument from "pdfkit";
import bwipjs from "bwip-js";
import { router } from "./_core/trpc";
import { tenantProcedure } from "./_core/tenantGuard";
import { getDb } from "./db";
import {
  receivingOrders,
  receivingOrderItems,
  pickingWaves,
  pickingOrders,
  shipments,
  labelAssociations,
  productLabels,
  warehouseLocations,
  warehouseZones,
  products,
  tenants,
  stageChecks,
  users,
} from "../drizzle/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Gera um PDF de etiqueta simples (10cm × 5cm) com código de barras Code-128 */
async function buildLabelPdf(
  labelCode: string,
  line1: string,
  line2?: string,
  line3?: string
): Promise<string> {
  const barcodeBuffer = await bwipjs.toBuffer({
    bcid: "code128",
    text: labelCode,
    scale: 2,
    height: 10,
    includetext: true,
    textxalign: "center",
  });

  const doc = new PDFDocument({
    size: [283.46, 141.73], // 10cm × 5cm
    margins: { top: 8, bottom: 8, left: 8, right: 8 },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  // Texto descritivo
  doc.fontSize(9).font("Helvetica-Bold").text(line1, 8, 10, { width: 267 });
  if (line2) doc.fontSize(8).font("Helvetica").text(line2, 8, 22, { width: 267 });
  if (line3) doc.fontSize(7).font("Helvetica").text(line3, 8, 33, { width: 267 });

  // Código de barras centralizado
  doc.image(barcodeBuffer, 42, 48, { width: 200, height: 50 });

  doc.end();

  const pdfBuffer = await new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  return `data:application/pdf;base64,${pdfBuffer.toString("base64")}`;
}

// ---------------------------------------------------------------------------
// Helper específico: Etiqueta de Pedido de Separação (novo design)
// ---------------------------------------------------------------------------

/** URL do logo Med@x (CDN) */
const MEDAX_LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663187653950/VPbZo3VRZUT62wWDPHVeqm/medax-logo-crop_81828352.png";

/**
 * Gera PDF de etiqueta de Pedido de Separação (design v2):
 *  - Fundo cinza claro (#e8ecf0) com borda arredondada azul-acinzentada
 *  - Marca d'água "Med@x" repetida em grade (texto cinza claro)
 *  - Logo Med@x (esquerda, topo) + Nº Pedido / Cliente / Destinatário (direita)
 *  - Ícone de entrega (caminho SVG simplificado) antes do Destinatário
 *  - Código de barras Code-128 grande centralizado na parte inferior
 * Tamanho: 15cm × 8cm
 */
async function buildPickingOrderLabelPdf(opts: {
  orderNumber: string;
  customerOrderNumber?: string | null;
  clientName?: string | null;
  recipientName?: string | null;
}): Promise<string> {
  const { orderNumber, customerOrderNumber, clientName, recipientName } = opts;
  const displayNumber = customerOrderNumber?.trim() || orderNumber;

  // Barcode — grande, sem texto interno (texto será desenhado manualmente)
  const barcodeBuffer = await bwipjs.toBuffer({
    bcid: "code128",
    text: displayNumber,
    scale: 4,
    height: 18,
    includetext: false,
  });

  // Baixar logo
  let logoBuffer: Buffer | null = null;
  try {
    const res = await fetch(MEDAX_LOGO_URL);
    if (res.ok) logoBuffer = Buffer.from(await res.arrayBuffer());
  } catch { /* sem logo */ }

  // PDF: 15cm × 8cm (em pontos: 1cm = 28.346pt)
  const W = 425.2;
  const H = 226.8;
  const R = 12; // raio das bordas arredondadas

  const doc = new PDFDocument({
    size: [W, H],
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  // ─ Fundo cinza claro com bordas arredondadas ─
  doc.roundedRect(0, 0, W, H, R).fill("#e8ecf0");

  // ─ Borda azul-acinzentada ─
  doc.roundedRect(1.5, 1.5, W - 3, H - 3, R)
    .strokeColor("#a0b0c8").lineWidth(2).stroke();

  // ─ Marca d'água "Med@x" repetida em grade ─
  doc.save();
  doc.fontSize(22).font("Helvetica-Bold").fillColor("#c8cfd8").opacity(0.55);
  const wmText = "Med@x";
  const wmCols = 4;
  const wmRows = 3;
  const wmColW = W / wmCols;
  const wmRowH = H / wmRows;
  for (let row = 0; row < wmRows; row++) {
    for (let col = 0; col < wmCols; col++) {
      const wx = col * wmColW + wmColW * 0.1;
      const wy = row * wmRowH + wmRowH * 0.3;
      doc.text(wmText, wx, wy, { lineBreak: false });
    }
  }
  doc.restore();

  // ─ Logo (esquerda, topo) ─
  const logoX = 14;
  const logoY = 12;
  const logoW = 140;
  const logoH = 60;
  if (logoBuffer) {
    doc.image(logoBuffer, logoX, logoY, { width: logoW, height: logoH, fit: [logoW, logoH] });
  } else {
    doc.fontSize(24).font("Helvetica-Bold").fillColor("#1a3a8c").opacity(1)
      .text("Med@x", logoX, logoY + 10, { lineBreak: false });
    doc.fontSize(8).font("Helvetica").fillColor("#555555")
      .text("Soluções Logísticas Para Saúde", logoX, logoY + 40, { lineBreak: false });
  }

  // ─ Dados do pedido (direita do logo) ─
  const textX = logoX + logoW + 14;
  const textW = W - textX - 14;

  // Nº do Pedido (negrito, grande)
  doc.fontSize(20).font("Helvetica-Bold").fillColor("#000000").opacity(1)
    .text(`N\u00ba do Pedido: ${displayNumber}`, textX, 12, { width: textW, lineBreak: false });

  // Cliente
  if (clientName?.trim()) {
    doc.fontSize(13).font("Helvetica").fillColor("#111111")
      .text(`Cliente: ${clientName.trim()}`, textX, 40, { width: textW, lineBreak: false });
  }

  // Ícone de entrega (caminho SVG simplificado via linhas/curvas PDFKit)
  // Desenhamos um caminhão minimalista usando formas básicas
  const iconY = clientName?.trim() ? 65 : 40;
  const iconX = textX;
  // Corpo do caminhão
  doc.save();
  doc.strokeColor("#888888").fillColor("#888888").lineWidth(1);
  // Caixa traseira
  doc.rect(iconX, iconY + 2, 16, 10).stroke();
  // Cabine
  doc.rect(iconX + 16, iconY + 5, 8, 7).stroke();
  // Para-brisa (triângulo)
  doc.moveTo(iconX + 16, iconY + 5).lineTo(iconX + 22, iconY + 5).lineTo(iconX + 24, iconY + 8).closePath().stroke();
  // Rodas
  doc.circle(iconX + 5, iconY + 13, 3).fill();
  doc.circle(iconX + 19, iconY + 13, 3).fill();
  // Pin de localização
  doc.circle(iconX + 30, iconY + 3, 4).stroke();
  doc.moveTo(iconX + 30, iconY + 7).lineTo(iconX + 30, iconY + 14).stroke();
  doc.restore();

  // Destinatário (ao lado do ícone)
  if (recipientName?.trim()) {
    doc.fontSize(13).font("Helvetica-Bold").fillColor("#111111")
      .text("Destinatário: ", textX + 38, iconY + 2, { continued: true, lineBreak: false })
      .font("Helvetica")
      .text(recipientName.trim(), { lineBreak: false });
  }

  // ─ Barcode centralizado na parte inferior ─
  const barcodeW = 340;
  const barcodeH = 72;
  const barcodeX = (W - barcodeW) / 2;
  const barcodeY = H - barcodeH - 22;
  doc.image(barcodeBuffer, barcodeX, barcodeY, { width: barcodeW, height: barcodeH });

  // Número do barcode centralizado abaixo
  doc.fontSize(13).font("Helvetica").fillColor("#000000")
    .text(displayNumber, 0, barcodeY + barcodeH + 2, { width: W, align: "center", lineBreak: false });

  doc.end();
  const pdfBuffer = await new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
  return `data:application/pdf;base64,${pdfBuffer.toString("base64")}`;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const labelReprintRouter = router({
  // ── 1. RECEBIMENTO ─────────────────────────────────────────────────────────

  /** Lista ordens de recebimento disponíveis para reimpressão */
  listReceiving: tenantProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().default(30),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const { effectiveTenantId, isGlobalAdmin } = ctx;

      const tenantFilter = isGlobalAdmin
        ? undefined
        : eq(receivingOrders.tenantId, effectiveTenantId);

      const searchFilter = input.search
        ? or(
            like(receivingOrders.orderNumber, `%${input.search}%`),
            like(receivingOrders.nfeNumber, `%${input.search}%`),
            like(receivingOrders.supplierName, `%${input.search}%`)
          )
        : undefined;

      const whereClause = tenantFilter && searchFilter
        ? and(tenantFilter, searchFilter)
        : tenantFilter ?? searchFilter;

      const rows = await db
        .select({
          id: receivingOrders.id,
          orderNumber: receivingOrders.orderNumber,
          nfeNumber: receivingOrders.nfeNumber,
          supplierName: receivingOrders.supplierName,
          status: receivingOrders.status,
          tenantId: receivingOrders.tenantId,
          createdAt: receivingOrders.createdAt,
        })
        .from(receivingOrders)
        .where(whereClause)
        .orderBy(desc(receivingOrders.createdAt))
        .limit(input.limit);

      return rows;
    }),

  /** Reimprime etiquetas de uma ordem de recebimento */
  reprintReceiving: tenantProcedure
    .input(z.object({ receivingOrderId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const { effectiveTenantId, isGlobalAdmin } = ctx;

      const [order] = await db
        .select()
        .from(receivingOrders)
        .where(eq(receivingOrders.id, input.receivingOrderId))
        .limit(1);

      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Ordem não encontrada" });
      if (!isGlobalAdmin && order.tenantId !== effectiveTenantId)
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });

      const pdf = await buildLabelPdf(
        order.orderNumber,
        `OT: ${order.orderNumber}`,
        order.supplierName ?? "",
        order.nfeNumber ? `NF: ${order.nfeNumber}` : undefined
      );

      return { success: true, labelCode: order.orderNumber, pdf };
    }),

  // ── 2. SEPARAÇÃO ───────────────────────────────────────────────────────────

  /** Lista ondas de picking para reimpressão */
  listWaves: tenantProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().default(30),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const { effectiveTenantId, isGlobalAdmin } = ctx;

      const tenantFilter = isGlobalAdmin
        ? undefined
        : eq(pickingWaves.tenantId, effectiveTenantId);

      const searchFilter = input.search
        ? like(pickingWaves.waveNumber, `%${input.search}%`)
        : undefined;

      const whereClause = tenantFilter && searchFilter
        ? and(tenantFilter, searchFilter)
        : tenantFilter ?? searchFilter;

      const rows = await db
        .select({
          id: pickingWaves.id,
          waveNumber: pickingWaves.waveNumber,
          status: pickingWaves.status,
          totalOrders: pickingWaves.totalOrders,
          totalItems: pickingWaves.totalItems,
          tenantId: pickingWaves.tenantId,
          createdAt: pickingWaves.createdAt,
        })
        .from(pickingWaves)
        .where(whereClause)
        .orderBy(desc(pickingWaves.createdAt))
        .limit(input.limit);

      return rows;
    }),

  /** Reimprime etiqueta de uma onda de picking */
  reprintWave: tenantProcedure
    .input(z.object({ waveId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const { effectiveTenantId, isGlobalAdmin } = ctx;

      const [wave] = await db
        .select()
        .from(pickingWaves)
        .where(eq(pickingWaves.id, input.waveId))
        .limit(1);

      if (!wave) throw new TRPCError({ code: "NOT_FOUND", message: "Onda não encontrada" });
      if (!isGlobalAdmin && wave.tenantId !== effectiveTenantId)
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });

      const pdf = await buildLabelPdf(
        wave.waveNumber,
        `Onda: ${wave.waveNumber}`,
        `Pedidos: ${wave.totalOrders ?? 0}  |  Itens: ${wave.totalItems ?? 0}`,
        `Status: ${wave.status}`
      );

      return { success: true, labelCode: wave.waveNumber, pdf };
    }),

  /** Lista pedidos de picking para reimpressão */
  listPickingOrders: tenantProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().default(30),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const { effectiveTenantId, isGlobalAdmin } = ctx;
      const tFilter = isGlobalAdmin
        ? undefined
        : eq(pickingOrders.tenantId, effectiveTenantId);
      const sFilter = input.search
        ? or(
            like(pickingOrders.orderNumber, `%${input.search}%`),
            like(pickingOrders.customerName, `%${input.search}%`),
            like(pickingOrders.customerOrderNumber, `%${input.search}%`)
          )
        : undefined;
      const whereClause =
        tFilter && sFilter ? and(tFilter, sFilter) : tFilter ?? sFilter;
      const rows = await db
        .select({
          id: pickingOrders.id,
          orderNumber: pickingOrders.orderNumber,
          customerOrderNumber: pickingOrders.customerOrderNumber,
          customerName: pickingOrders.customerName,
          status: pickingOrders.status,
          priority: pickingOrders.priority,
          totalItems: pickingOrders.totalItems,
          totalQuantity: pickingOrders.totalQuantity,
          waveId: pickingOrders.waveId,
          tenantId: pickingOrders.tenantId,
          createdAt: pickingOrders.createdAt,
        })
        .from(pickingOrders)
        .where(whereClause)
        .orderBy(desc(pickingOrders.createdAt))
        .limit(input.limit);
      return rows;
    }),

  /** Reimprime etiqueta de um pedido de picking */
  reprintPickingOrder: tenantProcedure
    .input(z.object({ pickingOrderId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const { effectiveTenantId, isGlobalAdmin } = ctx;
      const [order] = await db
        .select()
        .from(pickingOrders)
        .where(eq(pickingOrders.id, input.pickingOrderId))
        .limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado" });
      if (!isGlobalAdmin && order.tenantId !== effectiveTenantId)
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });

      // Buscar nome do tenant (cliente)
      let clientName: string | null = null;
      try {
        const [tenant] = await db
          .select({ name: tenants.name, tradeName: tenants.tradeName })
          .from(tenants)
          .where(eq(tenants.id, order.tenantId))
          .limit(1);
        clientName = tenant?.tradeName || tenant?.name || null;
      } catch { /* sem tenant */ }

      const pdf = await buildPickingOrderLabelPdf({
        orderNumber: order.orderNumber,
        customerOrderNumber: order.customerOrderNumber,
        clientName,
        recipientName: order.customerName,
      });
      return { success: true, labelCode: order.customerOrderNumber || order.orderNumber, pdf };
    }),

  // ── 3. VOLUMES ─────────────────────────────────────────────────────────────

  /** Lista expedições (volumes) para reimpressão */
  listShipments: tenantProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().default(30),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const { effectiveTenantId, isGlobalAdmin } = ctx;

      const tenantFilter = isGlobalAdmin
        ? undefined
        : eq(shipments.tenantId, effectiveTenantId);

      const searchFilter = input.search
        ? or(
            like(shipments.shipmentNumber, `%${input.search}%`),
            like(shipments.carrierName, `%${input.search}%`),
            like(shipments.vehiclePlate, `%${input.search}%`)
          )
        : undefined;

      const whereClause = tenantFilter && searchFilter
        ? and(tenantFilter, searchFilter)
        : tenantFilter ?? searchFilter;

      const rows = await db
        .select({
          id: shipments.id,
          shipmentNumber: shipments.shipmentNumber,
          carrierName: shipments.carrierName,
          vehiclePlate: shipments.vehiclePlate,
          driverName: shipments.driverName,
          status: shipments.status,
          tenantId: shipments.tenantId,
          createdAt: shipments.createdAt,
        })
        .from(shipments)
        .where(whereClause)
        .orderBy(desc(shipments.createdAt))
        .limit(input.limit);

      return rows;
    }),

  /** Reimprime etiqueta de volume de expedição */
  reprintShipment: tenantProcedure
    .input(z.object({ shipmentId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const { effectiveTenantId, isGlobalAdmin } = ctx;

      const [shipment] = await db
        .select()
        .from(shipments)
        .where(eq(shipments.id, input.shipmentId))
        .limit(1);

      if (!shipment) throw new TRPCError({ code: "NOT_FOUND", message: "Expedição não encontrada" });
      if (!isGlobalAdmin && shipment.tenantId !== effectiveTenantId)
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });

      const pdf = await buildLabelPdf(
        shipment.shipmentNumber,
        `Romaneio: ${shipment.shipmentNumber}`,
        shipment.carrierName ?? "",
        shipment.vehiclePlate ? `Placa: ${shipment.vehiclePlate}` : undefined
      );

      return { success: true, labelCode: shipment.shipmentNumber, pdf };
    }),

  // ── 4. PRODUTOS ────────────────────────────────────────────────────────────

  /** Lista etiquetas de produtos (labelAssociations) para reimpressão */
  listProductLabels: tenantProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().default(30),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const { effectiveTenantId, isGlobalAdmin } = ctx;

      const tenantFilter = isGlobalAdmin
        ? undefined
        : eq(labelAssociations.tenantId, effectiveTenantId);

      const searchFilter = input.search
        ? or(
            like(labelAssociations.labelCode, `%${input.search}%`),
            like(labelAssociations.uniqueCode, `%${input.search}%`),
            like(labelAssociations.batch, `%${input.search}%`)
          )
        : undefined;

      const whereClause = tenantFilter && searchFilter
        ? and(tenantFilter, searchFilter)
        : tenantFilter ?? searchFilter;

      const rows = await db
        .select({
          id: labelAssociations.id,
          labelCode: labelAssociations.labelCode,
          uniqueCode: labelAssociations.uniqueCode,
          batch: labelAssociations.batch,
          expiryDate: labelAssociations.expiryDate,
          unitsPerBox: labelAssociations.unitsPerBox,
          status: labelAssociations.status,
          tenantId: labelAssociations.tenantId,
          associatedAt: labelAssociations.associatedAt,
          productId: labelAssociations.productId,
        })
        .from(labelAssociations)
        .where(whereClause)
        .orderBy(desc(labelAssociations.associatedAt))
        .limit(input.limit);

      // Enriquecer com nome do produto
      const productIds = Array.from(new Set(rows.map((r) => r.productId)));
      let productMap: Record<number, string> = {};
      if (productIds.length > 0) {
        const prods = await db
          .select({ id: products.id, sku: products.sku, description: products.description })
          .from(products)
          .where(sql`${products.id} IN (${sql.join(productIds.map((id) => sql`${id}`), sql`, `)})`);
        productMap = Object.fromEntries(prods.map((p) => [p.id, `${p.sku} – ${p.description}`]));
      }

      return rows.map((r) => ({
        ...r,
        productName: productMap[r.productId] ?? `Produto #${r.productId}`,
      }));
    }),

  /** Reimprime etiqueta de produto (por labelCode) */
  reprintProductLabel: tenantProcedure
    .input(z.object({ labelCode: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const { effectiveTenantId, isGlobalAdmin } = ctx;

      const [label] = await db
        .select()
        .from(labelAssociations)
        .where(eq(labelAssociations.labelCode, input.labelCode))
        .limit(1);

      if (!label) throw new TRPCError({ code: "NOT_FOUND", message: "Etiqueta não encontrada" });
      if (!isGlobalAdmin && label.tenantId !== effectiveTenantId)
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });

      // Buscar nome do produto
      const [product] = await db
        .select({ sku: products.sku, description: products.description })
        .from(products)
        .where(eq(products.id, label.productId))
        .limit(1);

      const productLine = product
        ? `${product.sku} – ${product.description}`
        : `Produto #${label.productId}`;

      const expiryStr = label.expiryDate
        ? `Val: ${String(label.expiryDate).substring(0, 10)}`
        : undefined;

      const pdf = await buildLabelPdf(
        label.labelCode,
        productLine,
        label.batch ? `Lote: ${label.batch}` : "Sem lote",
        expiryStr
      );

      return { success: true, labelCode: label.labelCode, pdf };
    }),

  // ── 5. ENDEREÇOS ───────────────────────────────────────────────────────────

  /** Lista endereços de estoque para reimpressão */
  listLocations: tenantProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().default(50),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const { effectiveTenantId, isGlobalAdmin } = ctx;

      const tenantFilter = isGlobalAdmin
        ? undefined
        : eq(warehouseLocations.tenantId, effectiveTenantId);

      const searchFilter = input.search
        ? like(warehouseLocations.code, `%${input.search}%`)
        : undefined;

      const whereClause = tenantFilter && searchFilter
        ? and(tenantFilter, searchFilter)
        : tenantFilter ?? searchFilter;

      const rows = await db
        .select({
          id: warehouseLocations.id,
          code: warehouseLocations.code,
          zoneCode: warehouseLocations.zoneCode,
          aisle: warehouseLocations.aisle,
          rack: warehouseLocations.rack,
          level: warehouseLocations.level,
          status: warehouseLocations.status,
          tenantId: warehouseLocations.tenantId,
        })
        .from(warehouseLocations)
        .where(whereClause)
        .orderBy(warehouseLocations.code)
        .limit(input.limit);

      return rows;
    }),

  /** Reimprime etiquetas de múltiplos endereços em um único PDF */
  reprintLocationsBatch: tenantProcedure
    .input(
      z.object({
        locationIds: z.array(z.number()).min(1).max(200),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const { effectiveTenantId, isGlobalAdmin } = ctx;

      // Buscar todos os endereços solicitados
      const locs = await db
        .select()
        .from(warehouseLocations)
        .where(sql`${warehouseLocations.id} IN (${sql.join(input.locationIds.map((id) => sql`${id}`), sql`, `)})`)
        .orderBy(warehouseLocations.code);

      if (locs.length === 0)
        throw new TRPCError({ code: "NOT_FOUND", message: "Nenhum endereço encontrado" });

      // Verificar acesso cross-tenant
      if (!isGlobalAdmin) {
        const forbidden = locs.find((l) => l.tenantId !== effectiveTenantId);
        if (forbidden)
          throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado a endereço de outro tenant" });
      }

      // Gerar PDF com uma etiqueta por página (10cm × 5cm)
      const barcodeBuffers = await Promise.all(
        locs.map((loc) =>
          bwipjs.toBuffer({
            bcid: "code128",
            text: loc.code,
            scale: 2,
            height: 10,
            includetext: true,
            textxalign: "center",
          })
        )
      );

      const doc = new PDFDocument({
        size: [283.46, 141.73], // 10cm × 5cm
        margins: { top: 8, bottom: 8, left: 8, right: 8 },
        autoFirstPage: false,
      });

      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));

      locs.forEach((loc, idx) => {
        doc.addPage();
        const details = [loc.aisle, loc.rack, loc.level].filter(Boolean).join(" / ");
        doc.fontSize(9).font("Helvetica-Bold").text(`Endereço: ${loc.code}`, 8, 10, { width: 267 });
        if (loc.zoneCode) doc.fontSize(8).font("Helvetica").text(`Zona: ${loc.zoneCode}`, 8, 22, { width: 267 });
        if (details) doc.fontSize(7).font("Helvetica").text(details, 8, 33, { width: 267 });
        doc.image(barcodeBuffers[idx], 42, 48, { width: 200, height: 50 });
      });

      doc.end();

      const pdfBuffer = await new Promise<Buffer>((resolve) => {
        doc.on("end", () => resolve(Buffer.concat(chunks)));
      });

      return {
        success: true,
        count: locs.length,
        pdf: `data:application/pdf;base64,${pdfBuffer.toString("base64")}`,
      };
    }),

  // ── 6. VOLUMES DE STAGE ───────────────────────────────────────────────────

  /** Lista conferências de Stage concluídas para reimpressão de etiquetas de volume */
  listStageVolumes: tenantProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().default(30),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const { effectiveTenantId, isGlobalAdmin } = ctx;

      const tenantFilter = isGlobalAdmin
        ? undefined
        : eq(stageChecks.tenantId, effectiveTenantId);

      // Filtro por número do pedido do cliente
      const searchFilter = input.search
        ? or(
            like(stageChecks.customerOrderNumber, `%${input.search}%`),
            like(pickingOrders.customerName, `%${input.search}%`)
          )
        : undefined;

      const statusFilter = sql`${stageChecks.status} IN ('completed', 'divergent')`;

      const whereClause = [tenantFilter, searchFilter, statusFilter]
        .filter(Boolean)
        .reduce((acc, f) => (acc ? and(acc, f!) : f!));

      const rows = await db
        .select({
          id: stageChecks.id,
          customerOrderNumber: stageChecks.customerOrderNumber,
          customerName: pickingOrders.customerName,
          status: stageChecks.status,
          hasDivergence: stageChecks.hasDivergence,
          completedAt: stageChecks.completedAt,
          tenantId: stageChecks.tenantId,
          pickingOrderId: stageChecks.pickingOrderId,
        })
        .from(stageChecks)
        .leftJoin(pickingOrders, eq(stageChecks.pickingOrderId, pickingOrders.id))
        .where(whereClause)
        .orderBy(desc(stageChecks.completedAt))
        .limit(input.limit);

      return rows;
    }),

  /** Regera etiquetas de volume para um stageCheck */
  reprintStageVolume: tenantProcedure
    .input(
      z.object({
        stageCheckId: z.number(),
        totalVolumes: z.number().min(1).max(999),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const { effectiveTenantId, isGlobalAdmin } = ctx;

      const [check] = await db
        .select({
          id: stageChecks.id,
          tenantId: stageChecks.tenantId,
          customerOrderNumber: stageChecks.customerOrderNumber,
          pickingOrderId: stageChecks.pickingOrderId,
        })
        .from(stageChecks)
        .where(eq(stageChecks.id, input.stageCheckId))
        .limit(1);

      if (!check) throw new TRPCError({ code: "NOT_FOUND", message: "Conferência não encontrada" });
      if (!isGlobalAdmin && check.tenantId !== effectiveTenantId)
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });

      // Buscar dados do pedido para a etiqueta
      const [order] = await db
        .select({ customerName: pickingOrders.customerName })
        .from(pickingOrders)
        .where(eq(pickingOrders.id, check.pickingOrderId))
        .limit(1);

      // Buscar nome do tenant
      const [tenant] = await db
        .select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, check.tenantId))
        .limit(1);

      const { generateVolumeLabels } = await import("./volumeLabels");

      const labels = Array.from({ length: input.totalVolumes }, (_, i) => ({
        customerOrderNumber: check.customerOrderNumber,
        customerName: order?.customerName ?? "N/A",
        tenantName: tenant?.name ?? "N/A",
        volumeNumber: i + 1,
        totalVolumes: input.totalVolumes,
      }));

      const pdfBuffer = await generateVolumeLabels(labels);

      return {
        success: true,
        pdf: `data:application/pdf;base64,${pdfBuffer.toString("base64")}`,
      };
    }),

  /** Reimprime etiqueta de endereço */
  reprintLocation: tenantProcedure
    .input(z.object({ locationId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const { effectiveTenantId, isGlobalAdmin } = ctx;

      const [loc] = await db
        .select()
        .from(warehouseLocations)
        .where(eq(warehouseLocations.id, input.locationId))
        .limit(1);

      if (!loc) throw new TRPCError({ code: "NOT_FOUND", message: "Endereço não encontrado" });
      if (!isGlobalAdmin && loc.tenantId !== effectiveTenantId)
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });

      const details = [loc.aisle, loc.rack, loc.level]
        .filter(Boolean)
        .join(" / ");

      const pdf = await buildLabelPdf(
        loc.code,
        `Endereço: ${loc.code}`,
        loc.zoneCode ? `Zona: ${loc.zoneCode}` : undefined,
        details || undefined
      );

      return { success: true, labelCode: loc.code, pdf };
    }),
});
