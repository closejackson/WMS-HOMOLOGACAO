import { generateVolumeLabels } from "../server/volumeLabels";
import fs from "fs";

// Gera variações com dividerY=70, 80, 85 modificando temporariamente os parâmetros
// Como generateVolumeLabels não aceita dividerY como parâmetro, vamos gerar 3 PDFs
// usando a função atual (y=70) e depois com versões inline

const label = {
  customerOrderNumber: "005",
  customerName: "HMV",
  tenantName: "AESC - Mãe de Deus - UCG",
  volumeNumber: 1,
  totalVolumes: 12,
};

const buf = await generateVolumeLabels([label]);
fs.writeFileSync("/tmp/vol-current.pdf", buf);
console.log("PDF atual gerado:", buf.length, "bytes");
