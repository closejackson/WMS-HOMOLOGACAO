import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Scan, Package, CheckCircle2, XCircle, ArrowLeft } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

type StageItem = {
  productSku: string;
  productName: string;
  batch: string | null; // ✅ Adicionar lote para diferenciar itens
  checkedQuantity: number;
  scannedAt: Date;
};

export default function StageCheck() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<"search" | "checking">("search");
  const [customerOrderNumber, setCustomerOrderNumber] = useState("");
  const [stageCheckId, setStageCheckId] = useState<number | null>(null);
  const [orderInfo, setOrderInfo] = useState<any>(null);
  const [scannedItems, setScannedItems] = useState<StageItem[]>([]);
  const [currentSku, setCurrentSku] = useState("");
  const [showDivergenceModal, setShowDivergenceModal] = useState(false);
  const [divergentItems, setDivergentItems] = useState<any[]>([]);
  const [showVolumeModal, setShowVolumeModal] = useState(false);
  const [volumeQuantity, setVolumeQuantity] = useState("");
  
  // Modal de item fracionado
  const [showFractionalModal, setShowFractionalModal] = useState(false);
  const [fractionalData, setFractionalData] = useState<any>(null);
  const [fractionalQuantity, setFractionalQuantity] = useState("");

  const utils = trpc.useUtils();
  const getOrderQuery = trpc.stage.getOrderForStage.useQuery(
    { customerOrderNumber: customerOrderNumber.trim() },
    { enabled: false }
  );
  const startCheckMutation = trpc.stage.startStageCheck.useMutation();
  const recordItemMutation = trpc.stage.recordStageItem.useMutation();
  const completeCheckMutation = trpc.stage.completeStageCheck.useMutation();
  const generateLabelsMutation = trpc.stage.generateVolumeLabels.useMutation();
  const cancelCheckMutation = trpc.stage.cancelStageCheck.useMutation();

  // Buscar conferência ativa ao carregar
  const { data: activeCheck } = trpc.stage.getActiveStageCheck.useQuery();

  useEffect(() => {
    if (activeCheck) {
      setStep("checking");
      setStageCheckId(activeCheck.id);
      setCustomerOrderNumber(activeCheck.customerOrderNumber);
      setScannedItems(
        activeCheck.items
          .filter((item: any) => item.checkedQuantity > 0)
          .map((item: any) => ({
            productSku: item.productSku,
            productName: item.productName,
            batch: item.batch || null, // ✅ Incluir lote
            checkedQuantity: item.checkedQuantity,
            scannedAt: item.scannedAt,
          }))
      );
    }
  }, [activeCheck]);

  const handleSearchOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!customerOrderNumber.trim()) {
      toast.error("Digite ou bipe o número do pedido");
      return;
    }

    try {
      const result = await utils.stage.getOrderForStage.fetch({
        customerOrderNumber: customerOrderNumber.trim(),
      });

      setOrderInfo(result);

      // Iniciar conferência
      const checkResult = await startCheckMutation.mutateAsync({
        pickingOrderId: result.order.id,
        customerOrderNumber: customerOrderNumber.trim(),
      });

      setStageCheckId(checkResult.stageCheckId);
      setStep("checking");
      
      toast.success(checkResult.message);
    } catch (error: any) {
      toast.error(error.message || "Erro ao buscar pedido");
    }
  };

  const handleRecordItem = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentSku.trim()) {
      toast.error("Informe a etiqueta do produto");
      return;
    }

    if (!stageCheckId) {
      toast.error("Nenhuma conferência ativa");
      return;
    }

    try {
      // Chamar com autoIncrement = true
      const result = await recordItemMutation.mutateAsync({
        stageCheckId: stageCheckId,
        labelCode: currentSku.trim(),
        autoIncrement: true,
      });

      if (result.isFractional) {
        // Item fracionado: abrir modal para entrada manual
        setFractionalData(result);
        setShowFractionalModal(true);
        toast.info(result.message);
      } else {
        // Item inteiro: incrementado automaticamente
        // Adicionar item à lista
        // ✅ CORREÇÃO: Comparar por SKU+Lote ao invés de apenas SKU
        const existingIndex = scannedItems.findIndex(
          (item) => item.productSku === result.productSku && item.batch === (result.batch || null)
        );

        if (existingIndex >= 0) {
          const updated = [...scannedItems];
          updated[existingIndex].checkedQuantity = result.checkedQuantity ?? 0;
          updated[existingIndex].scannedAt = new Date();
          setScannedItems(updated);
        } else {
          setScannedItems([
            ...scannedItems,
            {
              productSku: result.productSku,
              productName: result.productName,
              batch: result.batch || null, // ✅ Incluir lote
              checkedQuantity: result.checkedQuantity ?? 0,
              scannedAt: new Date(),
            },
          ]);
        }

        toast.success(result.message);
      }

      // Limpar campo
      setCurrentSku("");
    } catch (error: any) {
      toast.error(error.message || "Erro ao registrar item");
    }
  };

  const handleRecordFractionalItem = async () => {
    const qty = parseInt(fractionalQuantity);
    if (!qty || qty <= 0) {
      toast.error("Informe uma quantidade válida");
      return;
    }

    if (!stageCheckId || !fractionalData) {
      toast.error("Dados inválidos");
      return;
    }

    try {
      const result = await recordItemMutation.mutateAsync({
        stageCheckId: stageCheckId,
        labelCode: fractionalData.labelCode,
        quantity: qty,
        autoIncrement: false,
      });

      // Adicionar item à lista
      // ✅ CORREÇÃO: Comparar por SKU+Lote ao invés de apenas SKU
      const existingIndex = scannedItems.findIndex(
        (item) => item.productSku === result.productSku && item.batch === (result.batch || null)
      );

      if (existingIndex >= 0) {
        const updated = [...scannedItems];
        updated[existingIndex].checkedQuantity = result.checkedQuantity ?? 0;
        updated[existingIndex].scannedAt = new Date();
        setScannedItems(updated);
      } else {
        setScannedItems([
          ...scannedItems,
          {
            productSku: result.productSku,
            productName: result.productName,
            batch: result.batch || null, // ✅ Incluir lote
            checkedQuantity: result.checkedQuantity ?? 0,
            scannedAt: new Date(),
          },
        ]);
      }

      toast.success(result.message);

      // Fechar modal e limpar dados
      setShowFractionalModal(false);
      setFractionalData(null);
      setFractionalQuantity("");
    } catch (error: any) {
      toast.error(error.message || "Erro ao registrar item");
    }
  };

  const handleCancelCheck = async () => {
    if (!stageCheckId) {
      toast.error("Nenhuma conferência ativa");
      return;
    }

    try {
      const result = await cancelCheckMutation.mutateAsync({
        stageCheckId: stageCheckId,
      });

      toast.success(result.message);
      
      // Resetar estado
      setStep("search");
      setCustomerOrderNumber("");
      setStageCheckId(null);
      setOrderInfo(null);
      setScannedItems([]);
      setCurrentSku("");
    } catch (error: any) {
      toast.error(error.message || "Erro ao cancelar conferência");
    }
  };

  const handleForceComplete = async () => {
    try {
      const result = await completeCheckMutation.mutateAsync({
        stageCheckId: stageCheckId!,
        force: true,
      });

      setShowDivergenceModal(false);
      setVolumeQuantity("");
      setShowVolumeModal(true);
      
      toast.success(result.message);
    } catch (error: any) {
      toast.error(error.message || "Erro ao forçar finalização");
    }
  };

  const handleCompleteCheck = async () => {
    if (scannedItems.length === 0) {
      toast.error("Registre pelo menos um item antes de finalizar");
      return;
    }

    try {
      const result = await completeCheckMutation.mutateAsync({
        stageCheckId: stageCheckId!,
      });

      toast.success(result.message);

      // Abrir modal para solicitar quantidade de volumes
      setShowVolumeModal(true);
    } catch (error: any) {
      // Verificar se é erro de divergência
      if (error.data?.cause?.divergentItems) {
        setDivergentItems(error.data.cause.divergentItems);
        setShowDivergenceModal(true);
      } else {
        toast.error(error.message || "Erro ao finalizar conferência");
      }
    }
  };

  const handleGenerateLabels = async () => {
    const qty = parseInt(volumeQuantity);
    if (isNaN(qty) || qty < 1) {
      toast.error("Informe uma quantidade válida de volumes");
      return;
    }

    try {
      const result = await generateLabelsMutation.mutateAsync({
        customerOrderNumber,
        customerName: orderInfo?.order?.customerName || "N/A",
        tenantName: orderInfo?.tenantName || "N/A",
        totalVolumes: qty,
      });

      // Converter base64 para blob e baixar
      const byteCharacters = atob(result.pdfBase64);
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

      toast.success(`Etiquetas geradas com sucesso! (${qty} volumes)`);

      // Resetar estado
      setShowVolumeModal(false);
      setVolumeQuantity("");
      setStep("search");
      setCustomerOrderNumber("");
      setStageCheckId(null);
      setOrderInfo(null);
      setScannedItems([]);
    } catch (error: any) {
      toast.error(error.message || "Erro ao gerar etiquetas");
    }
  };

  if (step === "search") {
    return (
      <div className="container py-8">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => setLocation("/")}
            className="mb-4 text-white hover:text-white hover:bg-white/20"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          <h1 className="text-3xl font-bold text-white drop-shadow-lg">Stage - Conferência de Expedição</h1>
          <p className="text-white/80 drop-shadow mt-2">
            Confira pedidos separados antes da expedição
          </p>
        </div>

        <Card className="p-6 max-w-md mx-auto">
          <form onSubmit={handleSearchOrder} className="space-y-4">
            <div>
              <Label htmlFor="orderNumber">Número do Pedido</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  id="orderNumber"
                  value={customerOrderNumber}
                  onChange={(e) => setCustomerOrderNumber(e.target.value)}
                  placeholder="Digite ou bipe o número do pedido"
                  autoFocus
                />
                <Button type="submit" disabled={startCheckMutation.isPending}>
                  <Scan className="mr-2 h-4 w-4" />
                  Buscar
                </Button>
              </div>
            </div>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => {
            setStep("search");
            setCustomerOrderNumber("");
            setStageCheckId(null);
            setOrderInfo(null);
            setScannedItems([]);
          }}
          className="mb-4 text-white hover:text-white hover:bg-white/20"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Cancelar Conferência
        </Button>
        <h1 className="text-3xl font-bold text-white drop-shadow-lg">
          Conferindo Pedido: {customerOrderNumber}
        </h1>
        <p className="text-white/70 mt-2">
          Bipe cada produto para registrar automaticamente (+1 caixa)
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Formulário de registro */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <Package className="mr-2 h-5 w-5" />
            Registrar Item
          </h2>
          <form onSubmit={handleRecordItem} className="space-y-4">
            <div>
              <Label htmlFor="sku">Etiqueta do Produto</Label>
              <Input
                id="sku"
                value={currentSku}
                onChange={(e) => setCurrentSku(e.target.value)}
                placeholder="Bipe a etiqueta do lote"
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-1">
                Ao bipar, o sistema incrementa automaticamente +1 caixa
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={recordItemMutation.isPending}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {recordItemMutation.isPending ? "Processando..." : "Registrar Item"}
            </Button>
          </form>
        </Card>

        {/* Lista de itens conferidos */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">
            Itens Conferidos ({scannedItems.length})
          </h2>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {scannedItems.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Nenhum item conferido ainda
              </p>
            ) : (
              scannedItems.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium">{item.productSku}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.productName}
                    </p>
                    {item.batch && (
                      <p className="text-xs text-blue-600 font-semibold mt-1">
                        Lote: {item.batch}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg">{item.checkedQuantity}</p>
                    <p className="text-xs text-muted-foreground">unidades</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="mt-6 flex justify-between">
        {stageCheckId && (
          <Button
            variant="outline"
            size="lg"
            onClick={handleCancelCheck}
            disabled={cancelCheckMutation.isPending}
          >
            <XCircle className="mr-2 h-5 w-5" />
            Cancelar Conferência
          </Button>
        )}
        <Button
          size="lg"
          onClick={handleCompleteCheck}
          disabled={completeCheckMutation.isPending || scannedItems.length === 0}
          className={!stageCheckId ? "ml-auto" : ""}
        >
          <CheckCircle2 className="mr-2 h-5 w-5" />
          Finalizar Conferência
        </Button>
      </div>

      {/* Modal de Item Fracionado */}
      <Dialog open={showFractionalModal} onOpenChange={setShowFractionalModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Item Fracionado Detectado</DialogTitle>
            <DialogDescription>
              A quantidade restante é menor que 1 caixa. Informe a quantidade exata conferida.
            </DialogDescription>
          </DialogHeader>
          {fractionalData && (
            <div className="space-y-4 py-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm font-medium text-yellow-900">
                  {fractionalData.productName}
                </p>
                <p className="text-xs text-yellow-700 mt-1">
                  SKU: {fractionalData.productSku} | Lote: {fractionalData.batch}
                </p>
                <p className="text-xs text-yellow-700">
                  Quantidade restante: <span className="font-bold">{fractionalData.remainingQuantity}</span> unidades
                </p>
                <p className="text-xs text-yellow-700">
                  (1 caixa = {fractionalData.unitsPerBox} unidades)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fractionalQuantity">Quantidade Conferida (unidades)</Label>
                <Input
                  id="fractionalQuantity"
                  type="number"
                  placeholder="Ex: 15"
                  value={fractionalQuantity}
                  onChange={(e) => setFractionalQuantity(e.target.value)}
                  min="1"
                  max={fractionalData.remainingQuantity}
                  autoFocus
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowFractionalModal(false);
              setFractionalData(null);
              setFractionalQuantity("");
            }}>
              Cancelar
            </Button>
            <Button onClick={handleRecordFractionalItem} disabled={recordItemMutation.isPending}>
              {recordItemMutation.isPending ? "Registrando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Divergências */}
      <Dialog open={showDivergenceModal} onOpenChange={setShowDivergenceModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center text-destructive">
              <XCircle className="mr-2 h-5 w-5" />
              Divergências Encontradas
            </DialogTitle>
            <DialogDescription>
              Os seguintes itens apresentam diferenças entre o esperado e o conferido:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {divergentItems.map((item, index) => (
              <div key={index} className="p-3 bg-muted rounded-lg">
                <p className="font-medium">{item.productSku}</p>
                <p className="text-sm text-muted-foreground">{item.productName}</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">Esperado</p>
                    <p className="font-bold">{item.expected}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Conferido</p>
                    <p className="font-bold">{item.checked}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Diferença</p>
                    <p className={`font-bold ${item.divergence > 0 ? "text-green-600" : "text-red-600"}`}>
                      {item.divergence > 0 ? "+" : ""}{item.divergence}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter className="flex justify-between">
            <Button variant="outline" onClick={() => setShowDivergenceModal(false)}>
              Voltar e Corrigir
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleForceComplete}
              disabled={completeCheckMutation.isPending}
            >
              Forçar Finalização
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Quantidade de Volumes */}
      <Dialog open={showVolumeModal} onOpenChange={setShowVolumeModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Package className="mr-2 h-5 w-5" />
              Quantidade de Volumes
            </DialogTitle>
            <DialogDescription>
              Informe quantos volumes foram conferidos para gerar as etiquetas
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="volumeQty">Quantidade de Volumes</Label>
              <Input
                id="volumeQty"
                type="number"
                min="1"
                value={volumeQuantity}
                onChange={(e) => setVolumeQuantity(e.target.value)}
                placeholder="Ex: 3"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowVolumeModal(false);
              setVolumeQuantity("");
            }}>
              Cancelar
            </Button>
            <Button onClick={handleGenerateLabels} disabled={generateLabelsMutation.isPending}>
              {generateLabelsMutation.isPending ? "Gerando..." : "Gerar Etiquetas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
