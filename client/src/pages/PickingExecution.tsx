import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Package,
  CheckCircle2,
  AlertCircle,
  Scan,
  MapPin,
  Calendar,
  Lightbulb,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BarcodeScanner } from "@/components/BarcodeScanner";

export default function PickingExecution() {
  const [, params] = useRoute("/picking/:id");
  const [, setLocation] = useLocation();
  const orderId = params?.id ? parseInt(params.id) : 0;

  const [scannedCode, setScannedCode] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [pickedQuantity, setPickedQuantity] = useState("");
  const [locationId, setLocationId] = useState("");
  const [batch, setBatch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showLocationScanner, setShowLocationScanner] = useState(false);
  const [showBatchScanner, setShowBatchScanner] = useState(false);

  const { data: order, isLoading, refetch } = trpc.picking.getById.useQuery({ id: orderId });
  const { data: allLocations } = trpc.locations.list.useQuery();
  
  // Query para sugerir endereços (FIFO/FEFO)
  const { data: suggestions, refetch: refetchSuggestions } = trpc.picking.suggestLocations.useQuery(
    {
      productId: selectedItemId || 0,
      requestedQuantity: parseInt(pickedQuantity) || 1,
      tenantId: order?.tenantId, // Passar tenantId do pedido para admin
    },
    { enabled: !!selectedItemId && !!pickedQuantity && !!order?.tenantId }
  );

  const updateStatusMutation = trpc.picking.updateStatus.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Status atualizado com sucesso!");
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  const pickItemMutation = trpc.picking.pickItem.useMutation({
    onSuccess: () => {
      refetch();
      setSelectedItemId(null);
      setPickedQuantity("");
      setLocationId("");
      setBatch("");
      setShowSuggestions(false);
      toast.success("Item separado com sucesso!");
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  // Auto-focus no input de scanner
  useEffect(() => {
    const input = document.getElementById("scanner-input");
    if (input) {
      input.focus();
    }
  }, []);

  // Buscar sugestões quando item for selecionado
  useEffect(() => {
    if (selectedItemId && pickedQuantity) {
      refetchSuggestions();
      setShowSuggestions(true);
    }
  }, [selectedItemId, pickedQuantity]);

  const handleScan = (code: string) => {
    // Lógica de scanner - por enquanto apenas exibe
    toast.info(`Código escaneado: ${code}`);
    setScannedCode("");
  };

  const handleSelectItem = (itemId: number) => {
    setSelectedItemId(itemId);
    setPickedQuantity("");
    setLocationId("");
    setBatch("");
    setShowSuggestions(false);
  };

  const handleUseSuggestion = (suggestion: any) => {
    setLocationId(String(suggestion.locationId));
    setBatch(suggestion.batch || "");
    setPickedQuantity(String(Math.min(suggestion.availableQuantity, parseInt(pickedQuantity) || 1)));
  };

  const handlePickItem = () => {
    if (!selectedItemId || !pickedQuantity || !locationId) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    // Se locationId é um código (string), buscar o ID numérico
    let numericLocationId = parseInt(locationId);
    
    if (isNaN(numericLocationId) && allLocations) {
      // locationId é um código como "H01-08-01", buscar o ID
      const location = allLocations.find((loc: any) => loc.code === locationId);
      if (!location) {
        toast.error(`Endereço ${locationId} não encontrado`);
        return;
      }
      numericLocationId = location.id;
    }

    if (isNaN(numericLocationId)) {
      toast.error("Endereço inválido");
      return;
    }

    pickItemMutation.mutate({
      itemId: selectedItemId,
      pickedQuantity: parseInt(pickedQuantity),
      locationId: numericLocationId,
      batch: batch || undefined,
    });
  };

  const handleStartPicking = () => {
    updateStatusMutation.mutate({ id: orderId, status: "picking" });
  };

  const handleFinishPicking = () => {
    // Verificar se todos os itens foram separados
    const allPicked = order?.items.every((item: any) => item.status === "picked");
    if (!allPicked) {
      toast.error("Separe todos os itens antes de finalizar");
      return;
    }
    updateStatusMutation.mutate({ id: orderId, status: "picked" });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen p-4">
        <p className="text-center text-muted-foreground">Carregando pedido...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen p-4">
        <p className="text-center text-destructive">Pedido não encontrado</p>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { label: "Pendente", variant: "secondary" },
      picking: { label: "Separando", variant: "default" },
      picked: { label: "Separado", variant: "outline" },
    };

    const config = variants[status] || variants.pending;

    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getItemStatusIcon = (status: string) => {
    if (status === "picked") return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    if (status === "pending") return <Package className="h-5 w-5 text-gray-400" />;
    return <AlertCircle className="h-5 w-5 text-yellow-500" />;
  };

  const selectedItem = order.items.find((item: any) => item.id === selectedItemId);
  const progress = order.items.filter((item: any) => item.status === "picked").length;
  const total = order.items.length;
  const progressPercent = (progress / total) * 100;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-black/40 backdrop-blur-sm border-b border-white/10 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/picking")}
                className="text-white hover:text-white hover:bg-white/20"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
              <div>
                <h1 className="text-xl font-bold text-white drop-shadow">{order.orderNumber}</h1>
                <p className="text-sm text-white/70">Destinatário: {order.customerName}</p>
              </div>
            </div>
            {getStatusBadge(order.status)}
          </div>

          {/* Progress Bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-white/70">Progresso</span>
              <span className="font-semibold text-white">
                {progress}/{total} itens ({progressPercent.toFixed(0)}%)
              </span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-2">
              <div
                className="bg-blue-400 h-2 rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Scanner */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Scan className="h-5 w-5" />
            <Label>Scanner de Código de Barras</Label>
          </div>
          <div className="flex gap-2">
            <Input
              id="scanner-input"
              value={scannedCode}
              onChange={(e) => setScannedCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && scannedCode) {
                  handleScan(scannedCode);
                }
              }}
              placeholder="Escaneie ou digite o código"
              className="flex-1"
            />
            <Button onClick={() => handleScan(scannedCode)} disabled={!scannedCode}>
              Confirmar
            </Button>
          </div>
        </Card>

        {/* Action Buttons */}
        {order.status === "pending" && (
          <Button onClick={handleStartPicking} className="w-full" size="lg">
            Iniciar Separação
          </Button>
        )}

        {order.status === "picking" && (
          <Button onClick={handleFinishPicking} className="w-full" size="lg" variant="default">
            Finalizar Separação
          </Button>
        )}

        {/* Items List */}
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4">Itens do Pedido</h2>
          <div className="space-y-3">
            {order.items.map((item: any) => (
              <div
                key={`${item.id}-${item.productId}-${item.locationCode || 'no-loc'}`}
                className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                  selectedItemId === item.id
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
                onClick={() => handleSelectItem(item.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    {getItemStatusIcon(item.status)}
                    <div>
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-sm text-muted-foreground">
                        SKU: {item.productSku} | Solicitado: {item.requestedQuantity} {item.requestedUM}
                      </p>
                      {item.pickedQuantity > 0 && (
                        <p className="text-sm text-green-600">
                          Separado: {item.pickedQuantity} {item.requestedUM}
                        </p>
                      )}
                    </div>
                  </div>
                  {getStatusBadge(item.status)}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Picking Form */}
        {selectedItemId && selectedItem && selectedItem.status !== "picked" && (
          <Card className="p-4">
            <h2 className="text-lg font-semibold mb-4">Separar Item</h2>
            
            <div className="space-y-4">
              <div>
                <Label>Produto Selecionado</Label>
                <p className="text-sm font-medium mt-1">{selectedItem.productName}</p>
                <p className="text-xs text-muted-foreground">SKU: {selectedItem.productSku}</p>
              </div>

              <div>
                <Label>Quantidade a Separar *</Label>
                <Input
                  type="number"
                  min="1"
                  value={pickedQuantity}
                  onChange={(e) => setPickedQuantity(e.target.value)}
                  placeholder="Digite a quantidade"
                />
              </div>

              {/* Sugestões FIFO/FEFO */}
              {showSuggestions && suggestions && suggestions.length > 0 && (
                <Alert>
                  <Lightbulb className="h-4 w-4" />
                  <AlertTitle className="flex items-center gap-2">
                    Sugestões de Endereços
                    <Badge variant="outline" className="text-xs">
                      {suggestions[0].rule}
                    </Badge>
                  </AlertTitle>
                  <AlertDescription>
                    <div className="mt-3 space-y-2">
                      {suggestions.slice(0, 3).map((suggestion: any, index: number) => (
                        <div
                          key={index}
                          className="p-3 bg-white border rounded-lg cursor-pointer hover:border-blue-500 transition-colors"
                          onClick={() => handleUseSuggestion(suggestion)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">
                                #{suggestion.priority}
                              </Badge>
                              <MapPin className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{suggestion.locationCode}</span>
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {suggestion.availableQuantity} disponível
                            </span>
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground space-y-1">
                            {suggestion.batch && <p>Lote: {suggestion.batch}</p>}
                            {suggestion.expiryDate && (
                              <p>Validade: {new Date(suggestion.expiryDate).toLocaleDateString("pt-BR")}</p>
                            )}
                            <p>Recebido: {new Date(suggestion.receivedDate).toLocaleDateString("pt-BR")}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <div>
                <Label>Cód. do Endereço *</Label>
                <div className="flex gap-2">
                  <Input
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    placeholder="Ex: H01-08-01"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowLocationScanner(true)}
                  >
                    <Scan className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Clique em uma sugestão acima, scaneie ou digite manualmente
                </p>
              </div>

              <div>
                <Label>Lote (Opcional)</Label>
                <div className="flex gap-2">
                  <Input
                    value={batch}
                    onChange={(e) => setBatch(e.target.value)}
                    placeholder="Número do lote"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowBatchScanner(true)}
                    title="Scanear etiqueta do produto para extrair lote"
                  >
                    <Scan className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Scaneie a etiqueta do produto para extrair o lote automaticamente
                </p>
              </div>

              <Button
                onClick={handlePickItem}
                disabled={!pickedQuantity || !locationId || pickItemMutation.isPending}
                className="w-full"
              >
                {pickItemMutation.isPending ? "Processando..." : "Confirmar Separação"}
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* Scanner de Código de Endereço */}
      {showLocationScanner && (
        <BarcodeScanner
          onScan={(code) => {
            setLocationId(code);
            setShowLocationScanner(false);
          }}
          onClose={() => setShowLocationScanner(false)}
        />
      )}

      {/* Scanner Inteligente de Lote */}
      {showBatchScanner && (
        <BarcodeScanner
          onScan={(code) => {
            const extractedBatch = extractBatchFromBarcode(code);
            if (extractedBatch) {
              setBatch(extractedBatch);
              toast.success(`Lote extraído: ${extractedBatch}`);
            } else {
              toast.warning("Não foi possível extrair o lote. Digite manualmente.");
            }
            setShowBatchScanner(false);
          }}
          onClose={() => setShowBatchScanner(false)}
        />
      )}
    </div>
  );
}

/**
 * Função para extrair número de lote de código de barras
 * Tenta identificar padrões comuns de lote em etiquetas de produtos farmacêuticos
 */
function extractBatchFromBarcode(barcode: string): string | null {
  // Padrões comuns de lote:
  // 1. LOT seguido de números/letras: LOT12345, LOT-ABC123
  // 2. LOTE seguido de números/letras: LOTE12345
  // 3. L seguido de números: L12345
  // 4. Sequência alfanumérica de 6-12 caracteres após separadores
  
  const patterns = [
    /LOT[:\s-]?([A-Z0-9]{4,12})/i,
    /LOTE[:\s-]?([A-Z0-9]{4,12})/i,
    /\bL([0-9]{5,10})\b/,
    /BATCH[:\s-]?([A-Z0-9]{4,12})/i,
    /\(10\)([A-Z0-9]{6,12})/, // GS1 DataMatrix - lote
    /\(21\)([A-Z0-9]{6,20})/, // GS1 DataMatrix - serial number (pode conter lote)
  ];

  for (const pattern of patterns) {
    const match = barcode.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // Fallback: tentar encontrar sequência alfanumérica isolada de 6-12 caracteres
  const fallbackMatch = barcode.match(/\b([A-Z0-9]{6,12})\b/);
  if (fallbackMatch && fallbackMatch[1]) {
    return fallbackMatch[1];
  }

  return null;
}
