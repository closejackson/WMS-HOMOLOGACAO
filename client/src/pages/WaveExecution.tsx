import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Package, MapPin, Calendar, CheckCircle2, AlertCircle, Scan, Camera } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { PickingStepModal } from "@/components/PickingStepModal";

export default function WaveExecution() {
  const [, params] = useRoute("/picking/execute/:id");
  const [, navigate] = useLocation();
  const waveId = params?.id ? parseInt(params.id) : 0;

  const [scannedCode, setScannedCode] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isPickingModalOpen, setIsPickingModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [hasAutoPrinted, setHasAutoPrinted] = useState(false);
  const scannerInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, refetch } = trpc.wave.getPickingProgress.useQuery(
    { waveId },
    { enabled: waveId > 0, refetchInterval: 3000 } // Atualizar a cada 3 segundos
  );

  const completeWaveMutation = trpc.wave.completeWave.useMutation({
    onSuccess: (result) => {
      toast.success(result.message);
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao finalizar onda: ${error.message}`);
    },
  });

  const generateDocumentMutation = trpc.wave.generateDocument.useMutation({
    onSuccess: (result) => {
      // Converter base64 para blob e fazer download
      const byteCharacters = atob(result.pdf);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      
      // Criar link de download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success('Documento gerado com sucesso!');
    },
    onError: (error) => {
      toast.error(`Erro ao gerar documento: ${error.message}`);
    },
  });

  const utils = trpc.useUtils();
  
  const registerMutation = trpc.picking.registerPickedItem.useMutation({
    onSuccess: (result) => {
      setFeedback({
        type: "success",
        message: `✓ Item registrado! ${result.pickedQuantity}/${result.totalQuantity} separados`,
      });
      refetch();
      // Invalidar lista de ondas para atualizar status
      utils.wave.list.invalidate();
      setScannedCode("");
      
      // Limpar feedback após 3 segundos
      setTimeout(() => setFeedback(null), 3000);
    },
    onError: (error) => {
      setFeedback({
        type: "error",
        message: error.message,
      });
      setScannedCode("");
      
      // Limpar feedback após 5 segundos
      setTimeout(() => setFeedback(null), 5000);
    },
  });

  // Auto-focus no input do scanner
  useEffect(() => {
    scannerInputRef.current?.focus();
  }, [feedback]);

  // Impressão automática ao completar onda
  useEffect(() => {
    if (data && data.progress.percentComplete === 100 && !hasAutoPrinted) {
      setHasAutoPrinted(true);
      // Aguardar 1 segundo antes de imprimir (dar tempo para animação)
      setTimeout(() => {
        // Verificar se handlePrintOrders existe antes de chamar
        if (data.items.length > 0) {
          const sortedItems = [...data.items].sort((a, b) => 
            a.locationCode.localeCompare(b.locationCode, 'pt-BR', { numeric: true })
          );
          
          // Agrupar itens por número de pedido
          const orderGroups = new Map<string, any[]>();
          sortedItems.forEach((item: any) => {
            const orderNum = item.orderNumber || "SEM_PEDIDO";
            if (!orderGroups.has(orderNum)) {
              orderGroups.set(orderNum, []);
            }
            orderGroups.get(orderNum)!.push(item);
          });

          // Gerar conteúdo HTML para impressão
          let printContent = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <title>Pedidos da Onda ${data.wave.waveNumber}</title>
              <style>
                @media print {
                  @page { margin: 1cm; }
                  .page-break { page-break-after: always; }
                }
                body { font-family: Arial, sans-serif; font-size: 12px; }
                .order-header { background: #f3f4f6; padding: 15px; margin-bottom: 20px; border-radius: 8px; }
                .order-title { font-size: 18px; font-weight: bold; color: #1f2937; margin-bottom: 5px; }
                .order-number { font-size: 16px; color: #ef4444; font-weight: bold; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                th { background: #e5e7eb; padding: 10px; text-align: left; border: 1px solid #d1d5db; font-weight: bold; }
                td { padding: 10px; border: 1px solid #d1d5db; }
                .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #d1d5db; text-align: center; color: #6b7280; }
              </style>
            </head>
            <body>
          `;

          let isFirst = true;
          orderGroups.forEach((items, orderNumber) => {
            if (!isFirst) {
              printContent += '<div class="page-break"></div>';
            }
            isFirst = false;

            // Agrupar itens por SKU, somando quantidades
            const skuGroups = new Map<string, {
              productName: string;
              productSku: string;
              totalQuantity: number;
              batch: string | null;
              expiryDate: any;
            }>();

            items.forEach((item: any) => {
              const key = item.productSku;
              if (!skuGroups.has(key)) {
                skuGroups.set(key, {
                  productName: item.productName,
                  productSku: item.productSku,
                  totalQuantity: 0,
                  batch: item.batch,
                  expiryDate: item.expiryDate,
                });
              }
              const group = skuGroups.get(key)!;
              group.totalQuantity += item.totalQuantity;
            });

            printContent += `
              <div class="order-header">
                <div class="order-title">Onda ${data.wave.waveNumber}</div>
                <div class="order-number">Nº do Pedido: ${orderNumber}</div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>SKU</th>
                    <th>Lote</th>
                    <th>Validade</th>
                    <th>Quantidade</th>
                  </tr>
                </thead>
                <tbody>
            `;

            skuGroups.forEach((group) => {
              const expiryDate = group.expiryDate 
                ? new Date(group.expiryDate).toLocaleDateString("pt-BR")
                : "-";
              
              // Formatar quantidade: SEMPRE em unidades
              const quantityDisplay = `${group.totalQuantity} ${group.totalQuantity === 1 ? 'un' : 'uns'}`;
              
              printContent += `
                <tr>
                  <td>${group.productName}</td>
                  <td>${group.productSku}</td>
                  <td>${group.batch || "-"}</td>
                  <td>${expiryDate}</td>
                  <td><strong>${quantityDisplay}</strong></td>
                </tr>
              `;
            });

            printContent += `
                </tbody>
              </table>
              <div class="footer">
                <p>Data de Impressão: ${new Date().toLocaleString("pt-BR")}</p>
              </div>
            `;
          });

          printContent += `
            </body>
            </html>
          `;

          // Abrir janela de impressão
          const printWindow = window.open("", "_blank");
          if (printWindow) {
            printWindow.document.write(printContent);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => {
              printWindow.print();
            }, 500);
          }
        }
      }, 1000);
    }
  }, [data, hasAutoPrinted]);

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!scannedCode.trim()) return;
    
    // Encontrar item pendente para escanear
    const pendingItem = data?.items.find(
      item => item.status !== "picked" && item.productSku === scannedCode.substring(0, 7)
    );

    if (!pendingItem) {
      setFeedback({
        type: "error",
        message: "Produto não encontrado ou já foi completamente separado",
      });
      setScannedCode("");
      return;
    }

    registerMutation.mutate({
      waveId,
      itemId: pendingItem.id,
      scannedCode: scannedCode.trim(),
      quantity: 1, // Por enquanto, sempre 1 unidade por escaneamento
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      pending: { label: "Pendente", className: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20" },
      picking: { label: "Separando", className: "bg-blue-500/10 text-blue-700 border-blue-500/20" },
      picked: { label: "Completo", className: "bg-green-500/10 text-green-700 border-green-500/20" },
    };

    const variant = variants[status] || variants.pending;
    return (
      <Badge variant="outline" className={variant.className}>
        {variant.label}
      </Badge>
    );
  };

  const handlePrintOrders = () => {
    if (!data) return;

    // Agrupar itens por número de pedido
    const orderGroups = new Map<string, any[]>();
    
    sortedItems.forEach((item: any) => {
      const orderNum = item.orderNumber || "SEM_PEDIDO";
      if (!orderGroups.has(orderNum)) {
        orderGroups.set(orderNum, []);
      }
      orderGroups.get(orderNum)!.push(item);
    });

    // Gerar conteúdo HTML para impressão
    let printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Pedidos da Onda ${data.wave.waveNumber}</title>
        <style>
          @media print {
            @page { margin: 1cm; }
            .page-break { page-break-after: always; }
          }
          body { font-family: Arial, sans-serif; font-size: 12px; }
          .order-header { background: #f3f4f6; padding: 15px; margin-bottom: 20px; border-radius: 8px; }
          .order-title { font-size: 18px; font-weight: bold; color: #1f2937; margin-bottom: 5px; }
          .order-number { font-size: 16px; color: #ef4444; font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th { background: #e5e7eb; padding: 10px; text-align: left; border: 1px solid #d1d5db; font-weight: bold; }
          td { padding: 10px; border: 1px solid #d1d5db; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #d1d5db; text-align: center; color: #6b7280; }
        </style>
      </head>
      <body>
    `;

    let isFirst = true;
    orderGroups.forEach((items, orderNumber) => {
      if (!isFirst) {
        printContent += '<div class="page-break"></div>';
      }
      isFirst = false;

      printContent += `
        <div class="order-header">
          <div class="order-title">Onda ${data.wave.waveNumber}</div>
          <div class="order-number">Nº do Pedido: ${orderNumber}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>SKU</th>
              <th>Endereço</th>
              <th>Lote</th>
              <th>Validade</th>
              <th>Quantidade</th>
            </tr>
          </thead>
          <tbody>
      `;

      items.forEach((item: any) => {
        const expiryDate = item.expiryDate 
          ? new Date(item.expiryDate).toLocaleDateString("pt-BR")
          : "-";
        
        // Formatar quantidade: SEMPRE em unidades
        const quantityDisplay = `${item.totalQuantity} ${item.totalQuantity === 1 ? 'un' : 'uns'}`;
        
        printContent += `
          <tr>
            <td>${item.productName}</td>
            <td>${item.productSku}</td>
            <td><strong>${item.locationCode}</strong></td>
            <td>${item.batch || "-"}</td>
            <td>${expiryDate}</td>
            <td><strong>${quantityDisplay}</strong></td>
          </tr>
        `;
      });

      printContent += `
          </tbody>
        </table>
        <div class="footer">
          <p>Data de Impressão: ${new Date().toLocaleString("pt-BR")}</p>
        </div>
      `;
    });

    printContent += `
      </body>
      </html>
    `;

    // Abrir janela de impressão
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 500);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <p className="text-white/70">Carregando onda...</p>
      </div>
    );
  }

  if (!data || !data.wave) {
    return (
      <div className="container mx-auto py-8">
        <Card className="p-8 text-center">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
          <h3 className="text-lg font-semibold mb-2">Onda não encontrada</h3>
          <Button onClick={() => navigate("/picking")} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </Card>
      </div>
    );
  }

  const { wave, items, progress } = data;
  const isCompleted = progress.percentComplete === 100;
  
  // Ordenar itens por endereço crescente
  const sortedItems = [...items].sort((a, b) => {
    // Comparar strings de endereço (ex: H01-01-04, H01-02-01)
    return a.locationCode.localeCompare(b.locationCode, 'pt-BR', { numeric: true });
  });

  // Função auxiliar para formatar quantidade: SEMPRE mostrar apenas em unidades
  const formatQuantityWithUnit = (quantityInUnits: number) => {
    return `${quantityInUnits} ${quantityInUnits === 1 ? 'unidade' : 'unidades'}`;
  };

  return (
    <>
      <PageHeader
        title={`Onda ${wave.waveNumber}`}
        description="Escaneie as etiquetas dos produtos para registrar a separação"
        actions={
          <Button onClick={() => navigate("/picking")} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        }
      />

      <div className="container mx-auto py-8 space-y-6">
        {/* Barra de Progresso */}
        <Card className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Progresso da Separação</h3>
                <p className="text-sm text-muted-foreground">
                  {progress.completedItems} de {progress.totalItems} itens completos
                </p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-primary">{progress.percentComplete}%</div>
                <p className="text-sm text-muted-foreground">
                  {progress.pickedQuantity} / {progress.totalQuantity} itens
                </p>
              </div>
            </div>
            <Progress value={progress.percentComplete} className="h-3" />
          </div>
        </Card>

        {/* Scanner de Etiquetas */}
        {!isCompleted && (
          <Card className="p-6">
            <form onSubmit={handleScan} className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Scan className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Scanner de Etiquetas</h3>
              </div>

              <div className="flex gap-2">
                <Input
                  ref={scannerInputRef}
                  type="text"
                  placeholder="Escaneie ou digite o código da etiqueta..."
                  value={scannedCode}
                  onChange={(e) => setScannedCode(e.target.value)}
                  className="flex-1 text-lg"
                  autoFocus
                  disabled={registerMutation.isPending}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setIsCameraOpen(true)}
                  disabled={registerMutation.isPending}
                  title="Usar câmera"
                >
                  <Camera className="h-5 w-5" />
                </Button>
                <Button type="submit" disabled={!scannedCode.trim() || registerMutation.isPending}>
                  {registerMutation.isPending ? "Processando..." : "Confirmar"}
                </Button>
              </div>

              {feedback && (
                <div
                  className={`p-4 rounded-lg flex items-start gap-3 ${
                    feedback.type === "success"
                      ? "bg-green-500/10 text-green-700 border border-green-500/20"
                      : "bg-red-500/10 text-red-700 border border-red-500/20"
                  }`}
                >
                  {feedback.type === "success" ? (
                    <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  )}
                  <p className="text-sm font-medium">{feedback.message}</p>
                </div>
              )}
            </form>
          </Card>
        )}

        {/* Onda Completa */}
        {isCompleted && (
          <Card className="p-8 text-center bg-green-500/5 border-green-500/20">
            <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-green-600" />
            <h3 className="text-2xl font-bold mb-2 text-green-700">Onda Concluída!</h3>
            <p className="text-muted-foreground mb-6">
              Todos os itens foram separados com sucesso.
            </p>
            <div className="flex flex-col gap-3 items-center">
              {data?.wave.status !== "completed" && (
                <Button 
                  onClick={() => completeWaveMutation.mutate({ waveId })} 
                  size="lg"
                  className="bg-green-600 hover:bg-green-700"
                  disabled={completeWaveMutation.isPending}
                >
                  {completeWaveMutation.isPending ? "Finalizando..." : "✓ Finalizar Separação"}
                </Button>
              )}
              <div className="flex gap-3">
                <Button 
                  onClick={() => generateDocumentMutation.mutate({ id: waveId })} 
                  variant="default"
                  disabled={generateDocumentMutation.isPending}
                >
                  {generateDocumentMutation.isPending ? "Gerando..." : "Imprimir Documento"}
                </Button>
                <Button onClick={handlePrintOrders} variant="outline">
                  Imprimir Pedidos (Antigo)
                </Button>
                <Button onClick={() => navigate("/picking")} variant="outline">
                  Voltar para Separação
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Lista de Itens */}
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Itens da Onda</h3>
          
          {sortedItems.map((item) => {
            const progressPercent = item.totalQuantity > 0 
              ? Math.round((item.pickedQuantity / item.totalQuantity) * 100)
              : 0;

            return (
              <Card key={`${item.id}-${item.productId}-${item.locationCode}`} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-3">
                        <Package className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <h4 className="font-semibold">{item.productName}</h4>
                          <p className="text-sm text-muted-foreground">SKU: {item.productSku}</p>
                        </div>
                      </div>
                      {(item as any).orderNumber && (
                        <div className="text-right">
                          <p className="text-sm font-semibold text-gray-900">
                            Nº do Pedido: {(item as any).orderNumber}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm mt-3">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span>Endereço: <strong>{item.locationCode}</strong></span>
                      </div>
                      {item.batch && (
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          <span>Lote: <strong>{item.batch}</strong></span>
                        </div>
                      )}
                      {item.expiryDate && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>Validade: <strong>{new Date(item.expiryDate).toLocaleDateString("pt-BR")}</strong></span>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Progresso: {formatQuantityWithUnit(item.pickedQuantity)} / {formatQuantityWithUnit(item.totalQuantity)}
                        </span>
                        <span className="font-semibold">{progressPercent}%</span>
                      </div>
                      <Progress value={progressPercent} className="h-2" />
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    {getStatusBadge(item.status)}
                    {item.status !== "picked" && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedItem(item);
                          setIsPickingModalOpen(true);
                        }}
                      >
                        Separar
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Modal de Separação Guiada */}
      {isPickingModalOpen && selectedItem && (
        <PickingStepModal
          isOpen={isPickingModalOpen}
          waveId={waveId}
          onClose={() => {
            setIsPickingModalOpen(false);
            setSelectedItem(null);
          }}
          onComplete={(data) => {
            // Registrar item separado
            registerMutation.mutate({
              waveId,
              itemId: selectedItem.id,
              scannedCode: data.productCode,
              quantity: data.quantity,
            });
            setIsPickingModalOpen(false);
            setSelectedItem(null);
          }}
          item={selectedItem}
        />
      )}

      {/* Scanner de Câmera */}
      {isCameraOpen && (
        <BarcodeScanner
          onScan={(code) => {
            setScannedCode(code);
            setIsCameraOpen(false);
            // Submeter automaticamente após scan
            setTimeout(() => {
              const pendingItem = data?.items.find(
                item => item.status !== "picked" && item.productSku === code.substring(0, 7)
              );
              if (pendingItem) {
                registerMutation.mutate({
                  waveId,
                  itemId: pendingItem.id,
                  scannedCode: code.trim(),
                  quantity: 1,
                });
              } else {
                setFeedback({
                  type: "error",
                  message: "Produto não encontrado ou já foi completamente separado",
                });
                setTimeout(() => setFeedback(null), 5000);
              }
            }, 100);
          }}
          onClose={() => setIsCameraOpen(false)}
        />
      )}
    </>
  );
}
