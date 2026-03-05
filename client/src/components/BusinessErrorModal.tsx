import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertCircle, XCircle, Info, Lock, PackageX, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ErrorType = 
  | "insufficient_stock" 
  | "product_not_found" 
  | "permission_denied" 
  | "divergence"
  | "invalid_data"
  | "duplicate_entry"
  | "generic";

interface InsufficientStockItem {
  productSku: string;
  productName: string;
  requestedQuantity: number;
  requestedUnit: string;
  requestedUnits: number;
  availableQuantity: number;
  availableBoxes?: number;
  unitsPerBox?: number;
}

interface BusinessErrorModalProps {
  open: boolean;
  onClose: () => void;
  type: ErrorType;
  title: string;
  message: string;
  details?: Array<{
    label: string;
    value: string;
    variant?: "default" | "error" | "success" | "warning";
  }>;
  insufficientStockItems?: InsufficientStockItem[];
  actionLabel?: string;
  onAction?: () => void;
  onAdjust?: () => void;
}

const errorConfig = {
  insufficient_stock: {
    icon: AlertTriangle,
    iconColor: "text-orange-500",
    titleColor: "text-orange-900",
  },
  product_not_found: {
    icon: PackageX,
    iconColor: "text-red-500",
    titleColor: "text-red-900",
  },
  permission_denied: {
    icon: Lock,
    iconColor: "text-red-500",
    titleColor: "text-red-900",
  },
  divergence: {
    icon: AlertCircle,
    iconColor: "text-yellow-500",
    titleColor: "text-yellow-900",
  },
  invalid_data: {
    icon: XCircle,
    iconColor: "text-red-500",
    titleColor: "text-red-900",
  },
  duplicate_entry: {
    icon: AlertCircle,
    iconColor: "text-orange-500",
    titleColor: "text-orange-900",
  },
  generic: {
    icon: AlertCircle,
    iconColor: "text-gray-500",
    titleColor: "text-gray-900",
  },
};

const variantStyles = {
  default: "text-gray-900",
  error: "text-red-600 font-medium",
  success: "text-green-600 font-medium",
  warning: "text-orange-600 font-medium",
};

export function BusinessErrorModal({
  open,
  onClose,
  type,
  title,
  message,
  details,
  insufficientStockItems,
  actionLabel,
  onAction,
  onAdjust,
}: BusinessErrorModalProps) {
  const config = errorConfig[type];
  const Icon = config.icon;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className={cn("flex items-center gap-2 text-lg", config.titleColor)}>
            <Icon className={cn("w-5 h-5", config.iconColor)} />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Mensagem Principal */}
          {message && (
            <p className="text-sm text-gray-700 leading-relaxed">
              {message}
            </p>
          )}

          {/* Itens com Estoque Insuficiente */}
          {insufficientStockItems && insufficientStockItems.length > 0 && (
            <div className="space-y-4">
              {insufficientStockItems.map((item, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-3">
                  {/* SKU e Nome */}
                  <p className="text-sm font-semibold text-gray-900">
                    SKU: {item.productSku} - {item.productName}
                  </p>
                  
                  {/* Quantidade Solicitada */}
                  <p className="text-sm text-red-600 font-medium">
                    <span className="font-semibold">Qtnd. Solicitada:</span>{" "}
                    {item.requestedQuantity.toLocaleString('pt-BR')} {item.requestedUnit} /{" "}
                    {item.requestedUnits.toLocaleString('pt-BR')} unidades
                  </p>
                  
                  {/* Quantidade Disponível */}
                  <p className="text-sm text-green-600 font-medium">
                    <span className="font-semibold">Qtnd. Disponível:</span>{" "}
                    {item.availableBoxes !== undefined && item.unitsPerBox 
                      ? `${item.availableBoxes.toLocaleString('pt-BR')} ${item.requestedUnit} / `
                      : ''}
                    {item.availableQuantity.toLocaleString('pt-BR')} unidades
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Detalhes Estruturados */}
          {details && details.length > 0 && (
            <div className="space-y-3 border-t pt-4">
              {details.map((detail, index) => (
                <div key={index}>
                  <p className={cn("text-sm", variantStyles[detail.variant || "default"])}>
                    <span className="font-semibold">{detail.label}:</span> {detail.value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Botões de Ação */}
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose}>
              Fechar
            </Button>
            {type === "insufficient_stock" && onAdjust && (
              <Button 
                onClick={() => {
                  onAdjust();
                  onClose();
                }} 
                variant="default"
                className="bg-blue-600 hover:bg-blue-700"
              >
                Ajustar Quantidades
              </Button>
            )}
            {actionLabel && onAction && (
              <Button onClick={onAction}>
                {actionLabel}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
