import PDFDocument from "pdfkit";
import bwipjs from "bwip-js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface VolumeLabel {
  customerOrderNumber: string;
  customerName: string;
  tenantName: string;
  volumeNumber: number;
  totalVolumes: number;
}

/**
 * Gera etiquetas de volumes em PDF (10cm x 5cm cada)
 *
 * Layout:
 * ┌─────────────────────────────────────────────────────┐
 * │  [Logo Med@x]              [||||||||||||||||||||]   │
 * ├─────────────────────────────────────────────────────┤  ← y=70
 * │  Destinatário: HMV              Pedido: 005         │
 * │  Cliente: AESC - Mãe de Deus - UCG                  │
 * │                Volume 1 de 12                       │
 * └─────────────────────────────────────────────────────┘
 */
export async function generateVolumeLabels(labels: VolumeLabel[]): Promise<Buffer> {
  // Dimensões: 10cm x 5cm em pontos (1cm = 28.346pt)
  const labelWidth = 283.46;   // 10cm
  const labelHeight = 141.73;  // 5cm
  const margin = 10;

  // Pré-gerar todos os códigos de barras (async, deduplica por pedido)
  const barcodes = new Map<string, Buffer>();
  for (const label of labels) {
    if (!barcodes.has(label.customerOrderNumber)) {
      const barcodeBuffer = await bwipjs.toBuffer({
        bcid: "code128",
        text: label.customerOrderNumber,
        scale: 3,
        height: 14,
        includetext: false,
        paddingwidth: 0,
        paddingheight: 0,
      });
      barcodes.set(label.customerOrderNumber, barcodeBuffer);
    }
  }

  // Carregar logo
  const logoPath = path.join(__dirname, "assets", "medax-logo.png");
  const logoExists = fs.existsSync(logoPath);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [labelWidth, labelHeight],
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      autoFirstPage: false,
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    labels.forEach((label) => {
      doc.addPage({ size: [labelWidth, labelHeight], margins: { top: 0, bottom: 0, left: 0, right: 0 } });

      // ── Fundo branco com borda ────────────────────────────────────────────
      doc
        .roundedRect(1, 1, labelWidth - 2, labelHeight - 2, 6)
        .fillAndStroke("#FFFFFF", "#CCCCCC");

      // ── SEÇÃO SUPERIOR: Logo (esquerda) + Barcode (direita) ──────────────
      // Linha divisória em y=70 — logo e barcode ficam acima dela
      const dividerY = 85;  // Opção B: mais espaço para logo e barcode

      // Logo: cabe em ~55% da largura, altura máxima = dividerY - margin*2
      const logoW = 169;          // 130 × 1.3 = 169pt (+30%)
      const logoH = dividerY - margin * 2;  // ~50pt (limitado pela altura da seção)

      if (logoExists) {
        doc.image(logoPath, margin, margin, {
          width: logoW,
          height: logoH,
          fit: [logoW, logoH],
        });
      } else {
        doc
          .fontSize(16)
          .font("Helvetica-Bold")
          .fillColor("#1a3a8c")
          .text("Med@x", margin, margin + 4, { width: logoW });
        doc
          .fontSize(7)
          .font("Helvetica")
          .fillColor("#666666")
          .text("Soluções Logísticas Para Saúde", margin, margin + 28, { width: logoW });
      }

      // Barcode: ocupa o lado direito, 60% maior que a versão original (58×48 → 93×77)
      // Ajustado para caber dentro da altura da seção superior (dividerY - margin)
      const barcodeW = 110;
      const barcodeH = Math.min(55, dividerY - margin - 4);
      const barcodeX = labelWidth - margin - barcodeW;
      const barcodeY = margin + (logoH - barcodeH) / 2;

      const barcodeBuffer = barcodes.get(label.customerOrderNumber)!;
      doc.image(barcodeBuffer, barcodeX, barcodeY > margin ? barcodeY : margin, {
        width: barcodeW,
        height: barcodeH,
        fit: [barcodeW, barcodeH],
      });

      // ── Linha divisória horizontal em y=70 ───────────────────────────────
      doc
        .moveTo(margin, dividerY)
        .lineTo(labelWidth - margin, dividerY)
        .lineWidth(1.0)
        .strokeColor("#000000")
        .stroke();

      // ── SEÇÃO INFERIOR: Dados do pedido ───────────────────────────────────
      doc.fillColor("#000000");

      const remainingH = labelHeight - dividerY;
      const textMarginTop = 8;

      // Linha 1: Destinatário (esquerda) + Pedido (direita)
      const line1Y = dividerY + textMarginTop;
      const halfWidth = (labelWidth - margin * 2) / 2;

      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .text(`Destinatário: ${label.customerName}`, margin, line1Y, {
          width: halfWidth + 10,
          align: "left",
          lineBreak: false,
        });

      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .text(`Pedido: ${label.customerOrderNumber}`, margin + halfWidth - 10, line1Y, {
          width: halfWidth + 10,
          align: "right",
          lineBreak: false,
        });

      // Linha 2: Cliente
      const line2Y = line1Y + 18;
      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .text(`Cliente: ${label.tenantName}`, margin, line2Y, {
          width: labelWidth - margin * 2,
          align: "left",
        });

      // Linha 3: Volume N de X — centralizado
      const line3Y = line2Y + 18;
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .text(`Volume ${label.volumeNumber} de ${label.totalVolumes}`, margin, line3Y, {
          width: labelWidth - margin * 2,
          align: "center",
        });
    });

    doc.end();
  });
}
