import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertCircle } from "lucide-react";

interface InsufficientStockModalProps {
  open: boolean;
  onClose: () => void;
  productSku: string;
  productName: string;
  requestedQuantity: number;
  requestedUnit: string;
  availableQuantity: number;
  availableUnit: string;
}

export function InsufficientStockModal({
  open,
  onClose,
  productSku,
  productName,
  requestedQuantity,
  requestedUnit,
  availableQuantity,
  availableUnit,
}: InsufficientStockModalProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <AlertCircle className="w-5 h-5 text-red-500" />
            Quantidade insuficiente:
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* SKU e Nome do Produto */}
          <div>
            <p className="text-sm font-semibold text-gray-900">
              SKU: {productSku} - {productName}
            </p>
          </div>

          {/* Quantidade Solicitada (Vermelho) */}
          <div>
            <p className="text-sm text-red-600 font-medium">
              <span className="font-semibold">Qtnd. Solicitada:</span> {requestedQuantity.toLocaleString('pt-BR')} {requestedUnit} / {(requestedQuantity * (requestedUnit.includes('caixa') ? 1 : 1)).toLocaleString('pt-BR')} unidades
            </p>
          </div>

          {/* Quantidade Disponível (Verde) */}
          <div>
            <p className="text-sm text-green-600 font-medium">
              <span className="font-semibold">Qtnd. Disponível:</span> {availableQuantity.toLocaleString('pt-BR')} {availableUnit} / {availableQuantity.toLocaleString('pt-BR')} unidades
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
