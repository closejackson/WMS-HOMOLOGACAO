import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, X } from "lucide-react";

interface LabelData {
  code: string;
  zoneName?: string;
  locationType?: string;
  aisle?: string;
  rack?: string;
  level?: string;
  position?: string;
  // Para pré-alocação
  endereco?: string;
  codInterno?: string;
  lote?: string;
  quantidade?: number;
}

interface LabelPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: LabelData[];
  onConfirm: () => void;
  type: "location" | "preallocation";
}

export function LabelPreviewDialog({
  open,
  onOpenChange,
  labels,
  onConfirm,
  type,
}: LabelPreviewDialogProps) {
  const barcodeRefs = useRef<(SVGSVGElement | null)[]>([]);

  useEffect(() => {
    if (open && labels.length > 0) {
      // Gerar códigos de barras para cada etiqueta
      labels.forEach((label, index) => {
        const svg = barcodeRefs.current[index];
        if (svg) {
          try {
            const code = type === "preallocation" ? label.endereco : label.code;
            JsBarcode(svg, code || "", {
              format: "CODE128",
              width: 2,
              height: 50,
              displayValue: true,
              fontSize: 14,
              margin: 5,
            });
          } catch (error) {
            console.error("Erro ao gerar código de barras:", error);
          }
        }
      });
    }
  }, [open, labels, type]);

  const renderLocationLabel = (label: LabelData, index: number) => {
    const zoneName = label.zoneName || "Armazenagem";
    const tipoText = label.locationType === "whole" ? "Palete Inteiro" : "Fração";
    const details = [];
    if (label.aisle) details.push(`Rua: ${label.aisle}`);
    if (label.rack) details.push(`Préd: ${label.rack}`);
    if (label.level) details.push(`Andar: ${label.level}`);
    const detailsText = details.length > 0 ? details.join(" | ") : "Endereço de Armazenagem";

    return (
      <div
        key={index}
        className="border-2 border-gray-300 rounded-lg p-4 flex flex-col items-center justify-center text-center bg-white"
        style={{ width: "10cm", height: "5cm" }}
      >
        <div className="text-sm font-bold text-gray-700 mb-2 tracking-wider">ENDEREÇO</div>
        <div className="text-5xl font-bold text-black mb-3">{label.code}</div>
        <svg
          ref={(el) => { barcodeRefs.current[index] = el; }}
          className="mb-2"
        />
        <div className="text-xs text-black mb-1">
          Zona: {zoneName} | Tipo: {tipoText}
        </div>
        <div className="text-xs text-gray-700">{detailsText}</div>
      </div>
    );
  };

  const renderPreallocationLabel = (label: LabelData, index: number) => {
    const loteText = label.lote ? `Lote: ${label.lote}` : "Sem lote";
    const productInfo = `Produto: ${label.codInterno} | ${loteText} | Qtd: ${label.quantidade}`;

    return (
      <div
        key={index}
        className="border-2 border-gray-300 rounded-lg p-4 flex flex-col items-center justify-center text-center bg-white"
        style={{ width: "10cm", height: "5cm" }}
      >
        <div className="text-sm font-bold text-gray-700 mb-2 tracking-wider">ENDEREÇO</div>
        <div className="text-5xl font-bold text-black mb-3">{label.endereco}</div>
        <svg
          ref={(el) => { barcodeRefs.current[index] = el; }}
          className="mb-2"
        />
        <div className="text-xs text-black mb-1">
          Zona: Pré-Alocação | Tipo: Palete Inteiro
        </div>
        <div className="text-xs text-gray-700">{productInfo}</div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pré-visualização de Etiquetas</DialogTitle>
          <DialogDescription>
            Visualize as etiquetas antes de fazer o download. Total: {labels.length} etiqueta(s).
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
          {labels.map((label, index) =>
            type === "preallocation"
              ? renderPreallocationLabel(label, index)
              : renderLocationLabel(label, index)
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-2" />
            Cancelar
          </Button>
          <Button onClick={onConfirm}>
            <Download className="h-4 w-4 mr-2" />
            Confirmar e Baixar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
