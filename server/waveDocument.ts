import PDFDocument from "pdfkit";
import { getDb } from "./db";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { pickingWaves, pickingWaveItems, pickingOrders, tenants } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

interface WaveDocumentData {
  waveCode: string;
  clientName: string;
  completedAt: Date;
  completedBy: string;
  orders: Array<{
    orderNumber: string;
    destination: string;
    items: Array<{
      productName: string;
      sku: string;
      batch: string | null;
      expiryDate: Date | null;
      quantity: number;
    }>;
  }>;
}

/**
 * Buscar dados da onda para o documento
 */
async function fetchWaveData(waveId: number): Promise<WaveDocumentData> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Buscar dados da onda
  const [wave] = await db
    .select({
      waveNumber: pickingWaves.waveNumber,
      tenantId: pickingWaves.tenantId,
      pickedAt: pickingWaves.pickedAt,
      pickedBy: pickingWaves.pickedBy,
    })
    .from(pickingWaves)
    .where(eq(pickingWaves.id, waveId));

  if (!wave) {
    throw new Error("Onda não encontrada");
  }

  // Buscar cliente
  const [tenant] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, wave.tenantId));

  // Buscar pedidos da onda com seus itens
  const waveOrders = await db
    .select({
      id: pickingOrders.id,
      orderNumber: pickingOrders.customerOrderNumber,
      deliveryAddress: pickingOrders.deliveryAddress,
      customerName: pickingOrders.customerName,
    })
    .from(pickingOrders)
    .where(eq(pickingOrders.waveId, waveId));

  // Para cada pedido, buscar seus itens específicos
  const orders = await Promise.all(
    waveOrders.map(async (order) => {
      // Buscar itens do pedido usando pickingOrderId diretamente
      const orderItems = await db
        .select({
          productName: pickingWaveItems.productName,
          sku: pickingWaveItems.productSku,
          locationCode: pickingWaveItems.locationCode,
          batch: pickingWaveItems.batch,
          expiryDate: pickingWaveItems.expiryDate,
          quantity: pickingWaveItems.totalQuantity,
          uniqueCode: (pickingWaveItems as any).uniqueCode, // ✅ Incluir uniqueCode
        })
        .from(pickingWaveItems)
        .where(
          and(
            eq(pickingWaveItems.waveId, waveId),
            eq(pickingWaveItems.pickingOrderId, order.id)
          )
        );

      // Agrupar itens por uniqueCode (SKU+Lote) para preservar múltiplos lotes
      const skuMap = new Map<string, {
        productName: string;
        sku: string;
        batch: string | null;
        expiryDate: Date | null;
        quantity: number;
      }>();

      orderItems.forEach((item) => {
        // ✅ Usar uniqueCode do banco (já calculado: SKU-LOTE)
        const key = item.uniqueCode || `${item.sku}-${item.batch || 'null'}`;
        if (!skuMap.has(key)) {
          skuMap.set(key, {
            productName: item.productName,
            sku: item.sku,
            batch: item.batch,
            expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
            quantity: 0,
          });
        }
        const group = skuMap.get(key)!;
        group.quantity += item.quantity;
      });

      return {
        orderNumber: order.orderNumber || "N/A",
        destination: order.customerName || "N/A",
        items: Array.from(skuMap.values()),
      };
    })
  );

  return {
    waveCode: wave.waveNumber,
    clientName: tenant?.name || "N/A",
    completedAt: wave.pickedAt ? new Date(wave.pickedAt) : new Date(),
    completedBy: wave.pickedBy?.toString() || "N/A",
    orders,
  };
}

/**
 * Gerar documento PDF da onda de separação
 */
export async function generateWaveDocument(waveId: number): Promise<Buffer> {
  const data = await fetchWaveData(waveId);

  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  // Cabeçalho com logo
  const headerY = 40;
  const logoPath = path.join(__dirname, "assets", "logo.jpg");
  
  // Adicionar logo se existir
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 40, headerY, { width: 120, height: 40 });
  }

  // Fundo do cabeçalho
  doc.rect(170, headerY, 385, 40).fill("#f0f0f0");

  // Informações do cabeçalho
  doc.fillColor("#000000");
  doc.font("Helvetica-Bold");
  doc.fontSize(10);
  doc.text(`Onda ${data.waveCode}`, 180, headerY + 5, { width: 120 });
  doc.text(`Cliente: ${data.clientName}`, 180, headerY + 20, { width: 150 });
  doc.text(`Data: ${data.completedAt.toLocaleDateString("pt-BR")}`, 350, headerY + 5, { width: 100 });
  doc.fontSize(8);
  doc.font("Helvetica");
  doc.text(`Separado por: ${data.completedBy}`, 350, headerY + 25, { width: 200 });

  let currentY = headerY + 60;

  // Itens agrupados por pedido
  for (const order of data.orders) {
    // Verificar se precisa de nova página
    if (currentY > 700) {
      doc.addPage();
      currentY = 40;
    }

    // Cabeçalho do pedido
    doc.fontSize(10);
    doc.font("Helvetica-Bold");
    doc.text(`Pedido: ${order.orderNumber}`, 40, currentY);
    doc.text(`Destinatário: ${order.destination}`, 40, currentY + 15);
    currentY += 40;

    // Cabeçalho da tabela
    doc.fontSize(9);
    doc.fillColor("#666666");
    doc.rect(40, currentY, 515, 20).fill("#e0e0e0");

    doc.fillColor("#000000");
    doc.font("Helvetica-Bold");
    doc.text("Produto", 45, currentY + 5, { width: 180 });
    doc.text("SKU", 230, currentY + 5, { width: 80 });
    doc.text("Lote", 315, currentY + 5, { width: 90 });
    doc.text("Validade", 410, currentY + 5, { width: 70 });
    doc.text("Quantidade", 485, currentY + 5, { width: 70, align: "right" });

    currentY += 25;

    // Itens do pedido
    doc.font("Helvetica");
    doc.fontSize(8);

    for (const item of order.items) {
      // Verificar se precisa de nova página
      if (currentY > 750) {
        doc.addPage();
        currentY = 40;
      }

      doc.text(item.productName || "N/A", 45, currentY, { width: 180 });
      doc.text(item.sku || "N/A", 230, currentY, { width: 80 });
      doc.text(item.batch || "N/A", 315, currentY, { width: 90 });
      doc.text(
        item.expiryDate ? item.expiryDate.toLocaleDateString("pt-BR") : "N/A",
        410,
        currentY,
        { width: 70 }
      );
      doc.text(`${item.quantity} un${item.quantity !== 1 ? 's' : ''}`, 485, currentY, { width: 70, align: "right" });

      currentY += 20;
    }

    // Linha separadora entre pedidos
    doc.moveTo(40, currentY + 5).lineTo(555, currentY + 5).stroke("#cccccc");
    currentY += 20;
  }

  // Rodapé
  const footerY = 800;
  doc.fontSize(8);
  doc.fillColor("#666666");
  doc.text(
    `Data de Impressão: ${new Date().toLocaleString("pt-BR")}`,
    40,
    footerY,
    { align: "center", width: 515 }
  );

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
