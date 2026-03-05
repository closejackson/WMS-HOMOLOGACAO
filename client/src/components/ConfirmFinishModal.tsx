import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, CheckCircle2, Package } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SummaryItem {
  productId: number;
  productSku: string;
  productDescription: string;
  batch: string | null;
  expectedQuantity: number | null;
  receivedQuantity: number | null;
  blockedQuantity: number | null;
  addressedQuantity: number;
}

interface ConfirmFinishModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  summary: SummaryItem[];
  receivingOrderCode: string;
  isLoading?: boolean;
}

export function ConfirmFinishModal({
  open,
  onClose,
  onConfirm,
  summary,
  receivingOrderCode,
  isLoading = false
}: ConfirmFinishModalProps) {
  const totalExpected = (summary || []).reduce((sum, item) => sum + (item.expectedQuantity || 0), 0);
  const totalReceived = (summary || []).reduce((sum, item) => sum + (item.receivedQuantity || 0), 0);
  const totalBlocked = (summary || []).reduce((sum, item) => sum + (item.blockedQuantity || 0), 0);
  const totalAddressed = (summary || []).reduce((sum, item) => sum + item.addressedQuantity, 0);

  const hasDivergence = totalReceived !== totalExpected;
  const hasBlocked = totalBlocked > 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Confirmar Finalização - Ordem {receivingOrderCode}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Alertas */}
          {hasDivergence && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Divergência detectada: Quantidade recebida ({totalReceived}) difere da esperada ({totalExpected})
              </AlertDescription>
            </Alert>
          )}

          {hasBlocked && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {totalBlocked} unidades bloqueadas por não-conformidade
              </AlertDescription>
            </Alert>
          )}

          {/* Resumo Geral */}
          <div className="grid grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
            <div>
              <div className="text-sm text-muted-foreground">Esperado</div>
              <div className="text-2xl font-bold">{totalExpected}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Recebido</div>
              <div className="text-2xl font-bold">{totalReceived}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Bloqueado</div>
              <div className="text-2xl font-bold text-destructive">{totalBlocked}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Endereçável</div>
              <div className="text-2xl font-bold text-green-600">{totalAddressed}</div>
            </div>
          </div>

          {/* Tabela Detalhada */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead className="text-right">Esperado</TableHead>
                  <TableHead className="text-right">Recebido</TableHead>
                  <TableHead className="text-right">Bloqueado</TableHead>
                  <TableHead className="text-right">Endereçável</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(summary || []).map((item, index) => {
                  const isDivergent = item.receivedQuantity !== item.expectedQuantity;
                  return (
                    <TableRow key={index} className={isDivergent ? "bg-yellow-50" : ""}>
                      <TableCell className="font-mono">{item.productSku}</TableCell>
                      <TableCell className="max-w-xs truncate">{item.productDescription}</TableCell>
                      <TableCell className="font-mono">{item.batch || "-"}</TableCell>
                      <TableCell className="text-right">{item.expectedQuantity || 0}</TableCell>
                      <TableCell className="text-right">{item.receivedQuantity || 0}</TableCell>
                      <TableCell className="text-right text-destructive">
                        {item.blockedQuantity || 0}
                      </TableCell>
                      <TableCell className="text-right font-bold text-green-600">
                        {item.addressedQuantity}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Explicação */}
          <div className="text-sm text-muted-foreground p-3 bg-muted rounded">
            <strong>Quantidade Endereçável:</strong> É a quantidade que será registrada no estoque (Recebido - Bloqueado).
            Ao confirmar, o sistema criará registros de inventory com essas quantidades.
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className="gap-2"
          >
            {isLoading ? (
              <>Finalizando...</>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Confirmar e Finalizar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
