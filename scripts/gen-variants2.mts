import PDFDocument from "pdfkit";
import bwipjs from "bwip-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function genLabel(dividerY: number): Promise<Buffer> {
  const labelWidth = 283.46;
  const labelHeight = 141.73;
  const margin = 10;
  const logoW = 169;
  const logoH = dividerY - margin * 2;
  const barcodeW = 110;
  const barcodeH = Math.min(55, dividerY - margin - 4);
  const barcodeX = labelWidth - margin - barcodeW;
  const barcodeY = margin + (logoH - barcodeH) / 2;

  const barcodeBuffer = await bwipjs.toBuffer({
    bcid: "code128", text: "005", scale: 3, height: 14, includetext: false,
  });

  const logoPath = path.join(__dirname, "../server/assets/medax-logo.png");

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [labelWidth, labelHeight],
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      autoFirstPage: false,
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.addPage({ size: [labelWidth, labelHeight], margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    doc.roundedRect(1, 1, labelWidth - 2, labelHeight - 2, 6).fillAndStroke("#FFFFFF", "#CCCCCC");
    doc.image(logoPath, margin, margin, { width: logoW, height: logoH, fit: [logoW, logoH] });
    doc.image(barcodeBuffer, barcodeX, barcodeY > margin ? barcodeY : margin, {
      width: barcodeW, height: barcodeH, fit: [barcodeW, barcodeH],
    });
    doc.moveTo(margin, dividerY).lineTo(labelWidth - margin, dividerY).lineWidth(1.0).strokeColor("#000000").stroke();

    doc.fillColor("#000000");
    const line1Y = dividerY + 8;
    const half = (labelWidth - margin * 2) / 2;
    doc.fontSize(9).font("Helvetica-Bold").text("Destinatário: HMV", margin, line1Y, { width: half + 10, align: "left", lineBreak: false });
    doc.fontSize(9).font("Helvetica-Bold").text("Pedido: 005", margin + half - 10, line1Y, { width: half + 10, align: "right", lineBreak: false });
    doc.fontSize(9).font("Helvetica-Bold").text("Cliente: AESC - Mãe de Deus - UCG", margin, line1Y + 18, { width: labelWidth - margin * 2 });
    doc.fontSize(10).font("Helvetica-Bold").text("Volume 1 de 12", margin, line1Y + 36, { width: labelWidth - margin * 2, align: "center" });
    doc.end();
  });
}

const [v70, v80, v85] = await Promise.all([genLabel(70), genLabel(80), genLabel(85)]);
fs.writeFileSync("/tmp/vol-v70.pdf", v70);
fs.writeFileSync("/tmp/vol-v80.pdf", v80);
fs.writeFileSync("/tmp/vol-v85.pdf", v85);
console.log("PDFs gerados");
