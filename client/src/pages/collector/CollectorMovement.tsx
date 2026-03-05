import { useState, useRef } from "react";
import { CollectorLayout } from "../../components/CollectorLayout";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { BarcodeScanner } from "../../components/BarcodeScanner";
import { Camera, Check, ArrowRight, Plus, Minus, Loader2 } from "lucide-react";
import { trpc } from "../../lib/trpc";
import { toast } from "sonner";

type Step = "origin" | "products" | "destination";

interface ScannedProduct {
  code: string;
  productId: number;
  productName: string;
  sku: string;
  batch: string | null;
  availableQuantity: number;
  quantity: number;
  unitsPerBox: number | null;
}

export function CollectorMovement() {
  const [step, setStep] = useState<Step>("origin");
  const [showScanner, setShowScanner] = useState(false);
  
  // Dados da movimentação
  const [originCode, setOriginCode] = useState("");
  const [originLocationId, setOriginLocationId] = useState<number | null>(null);
  const [scannedProducts, setScannedProducts] = useState<ScannedProduct[]>([]);
  const [currentProductCode, setCurrentProductCode] = useState("");
  const [destinationCode, setDestinationCode] = useState("");
  
  const codeInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  // Buscar produtos do endereço de origem
  // TODO: Precisamos primeiro buscar o locationId a partir do locationCode
  const { data: originProducts } = trpc.stock.getLocationProducts.useQuery(
    { locationId: originLocationId! },
    { enabled: !!originLocationId && step === "products" }
  );

  // Mutation de movimentação
  const movementMutation = trpc.stock.registerMovement.useMutation({
    onSuccess: () => {
      toast.success("Movimentação concluída!");
      handleReset();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const handleScanSuccess = (code: string) => {
    setShowScanner(false);
    
    if (step === "origin") {
      setOriginCode(code);
    } else if (step === "products") {
      setCurrentProductCode(code);
      handleAddProduct(code);
    } else if (step === "destination") {
      setDestinationCode(code);
    }
  };

  const handleConfirmOrigin = () => {
    if (!originCode.trim()) {
      toast.error("Escaneie o endereço de origem");
      return;
    }

    // Validar se endereço existe
    // TODO: Adicionar validação via API se necessário
    
    setStep("products");
    setTimeout(() => codeInputRef.current?.focus(), 100);
  };

  const handleAddProduct = async (code: string) => {
    if (!code.trim()) {
      toast.error("Escaneie a etiqueta do produto");
      return;
    }

    try {
      // Buscar dados reais do produto via API
      const productData = await utils.client.stock.getProductByCode.query({
        code,
        locationCode: originCode,
      });

      const unitsPerBox = productData.unitsPerBox || 1;
      
      // Verificar se já foi escaneado
      const existing = scannedProducts.find(p => p.sku === productData.sku);
      if (existing) {
        // Incrementar quantidade em 1 caixa fechada
        setScannedProducts(prev =>
          prev.map(p =>
            p.sku === productData.sku
              ? { ...p, quantity: p.quantity + unitsPerBox }
              : p
          )
        );
        toast.success("Caixa adicionada");
      } else {
        // Adicionar novo produto com 1 caixa fechada
        setScannedProducts(prev => [
          ...prev,
          {
            code,
            productId: productData.id,
            productName: productData.description,
            sku: productData.sku,
            batch: productData.batch,
            availableQuantity: productData.availableQuantity,
            quantity: unitsPerBox, // 1 caixa fechada
            unitsPerBox: unitsPerBox,
          },
        ]);
        toast.success("Produto adicionado (1 caixa)");
      }

      setCurrentProductCode("");
      codeInputRef.current?.focus();
    } catch (error: any) {
      toast.error(`Erro ao buscar produto: ${error.message}`);
      setCurrentProductCode("");
    }
  };

  const handleUpdateQuantity = (code: string, delta: number) => {
    setScannedProducts(prev =>
      prev.map(p => {
        if (p.code === code) {
          const unitsPerBox = p.unitsPerBox || 80;
          const newQuantity = p.quantity + (delta * unitsPerBox);
          return {
            ...p,
            quantity: Math.max(unitsPerBox, newQuantity), // Mínimo 1 caixa
          };
        }
        return p;
      })
    );
  };

  const handleRemoveProduct = (code: string) => {
    setScannedProducts(prev => prev.filter(p => p.code !== code));
  };

  const handleConfirmProducts = () => {
    if (scannedProducts.length === 0) {
      toast.error("Adicione pelo menos um produto");
      return;
    }

    setStep("destination");
    setTimeout(() => codeInputRef.current?.focus(), 100);
  };

  // Mutation para registrar movimentação
  const registerMovementMutation = trpc.stock.registerMovement.useMutation({
    onSuccess: () => {
      toast.success("Movimentação realizada com sucesso!");
      handleReset();
    },
    onError: (error) => {
      toast.error(`Erro ao movimentar: ${error.message}`);
    },
  });

  const handleConfirmMovement = async () => {
    if (!destinationCode.trim()) {
      toast.error("Escaneie o endereço de destino");
      return;
    }

    if (originCode === destinationCode) {
      toast.error("Endereço de destino deve ser diferente da origem");
      return;
    }

    try {
      // Buscar IDs dos endereços
      const originLocation = await utils.client.stock.getLocationByCode.query({ code: originCode });
      const destLocation = await utils.client.stock.getLocationByCode.query({ code: destinationCode });

      // Executar movimentações para cada produto
      let successCount = 0;
      for (const product of scannedProducts) {
        try {
          await registerMovementMutation.mutateAsync({
            productId: product.productId,
            fromLocationId: originLocation.id,
            toLocationId: destLocation.id,
            quantity: product.quantity,
            batch: product.batch || undefined,
            movementType: "transfer" as const,
            notes: `Movimentação via Coletor: ${originCode} → ${destinationCode}`,
          });
          successCount++;
        } catch (productError: any) {
          // Erro específico do produto
          const errorMsg = productError.message || "Erro desconhecido";
          
          // Identificar tipo de erro
          if (errorMsg.includes("Saldo insuficiente")) {
            toast.error(`❌ ${product.sku}: Saldo insuficiente no lote ${product.batch || "sem lote"}`);
          } else if (errorMsg.includes("único item/lote")) {
            toast.error(`❌ ${product.sku}: Destino já contém outro produto/lote`);
          } else if (errorMsg.includes("lote")) {
            toast.error(`❌ ${product.sku}: Erro de validação de lote - ${errorMsg}`);
          } else {
            toast.error(`❌ ${product.sku}: ${errorMsg}`);
          }
          
          // Interromper processamento em caso de erro
          throw productError;
        }
      }
      
      if (successCount === scannedProducts.length) {
        toast.success(`✅ ${successCount} produto(s) movimentado(s) com sucesso!`);
        handleReset();
      }
    } catch (error: any) {
      // Erro geral (endereços não encontrados, etc)
      const errorMsg = error.message || "Erro desconhecido";
      if (errorMsg.includes("Endereço") && errorMsg.includes("não encontrado")) {
        toast.error(`❌ ${errorMsg}`);
      } else if (!errorMsg.includes("Saldo") && !errorMsg.includes("lote")) {
        // Só mostrar erro geral se não for erro de produto (já mostrado acima)
        toast.error(`❌ Erro: ${errorMsg}`);
      }
    }
  };

  const handleReset = () => {
    setStep("origin");
    setOriginCode("");
    setOriginLocationId(null);
    setScannedProducts([]);
    setCurrentProductCode("");
    setDestinationCode("");
  };

  const handleBackToProducts = () => {
    setDestinationCode("");
    setStep("products");
  };

  const handleBackToOrigin = () => {
    setScannedProducts([]);
    setCurrentProductCode("");
    setStep("origin");
  };

  if (showScanner) {
    return (
      <BarcodeScanner
        onScan={handleScanSuccess}
        onClose={() => setShowScanner(false)}
      />
    );
  }

  // Etapa 1: Endereço de Origem
  if (step === "origin") {
    return (
      <CollectorLayout title="Movimentação - Origem">
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <Label className="text-lg font-semibold">Endereço de Origem</Label>
              <p className="text-sm text-gray-600">Escaneie ou digite o código do endereço</p>
              
              <div className="flex gap-2">
                <Input
                  ref={codeInputRef}
                  value={originCode}
                  onChange={(e) => setOriginCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleConfirmOrigin();
                    }
                  }}
                  placeholder="Código do endereço..."
                  className="h-12 text-base"
                  inputMode="text"
                  autoFocus
                />
                <Button
                  onClick={() => setShowScanner(true)}
                  className="h-12 px-4"
                >
                  <Camera className="w-5 h-5" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Button
            onClick={handleConfirmOrigin}
            disabled={!originCode.trim()}
            className="w-full h-14 text-lg"
          >
            <ArrowRight className="w-5 h-5 mr-2" />
            Avançar
          </Button>
        </div>
      </CollectorLayout>
    );
  }

  // Etapa 2: Produtos
  if (step === "products") {
    return (
      <CollectorLayout title={`Movimentação - ${originCode}`}>
        <div className="space-y-4">
          {/* Campo de leitura */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <Label className="text-lg font-semibold">Etiqueta do Produto</Label>
              <p className="text-sm text-gray-600">Escaneie os produtos a movimentar</p>
              
              <div className="flex gap-2">
                <Input
                  ref={codeInputRef}
                  value={currentProductCode}
                  onChange={(e) => setCurrentProductCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleAddProduct(currentProductCode);
                    }
                  }}
                  placeholder="Código da etiqueta..."
                  className="h-12 text-base"
                  inputMode="text"
                />
                <Button
                  onClick={() => setShowScanner(true)}
                  className="h-12 px-4"
                >
                  <Camera className="w-5 h-5" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Lista de produtos escaneados */}
          {scannedProducts.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <Label className="text-base font-semibold mb-3 block">
                  Produtos ({scannedProducts.length})
                </Label>
                
                <div className="space-y-2">
                  {scannedProducts.map((product) => {
                    const boxes = product.unitsPerBox ? Math.floor(product.quantity / product.unitsPerBox) : 0;
                    const pieces = product.quantity;
                    const displayName = `${product.sku} - ${product.productName}${product.batch ? ' - LOTE: ' + product.batch : ''}`;
                    
                    return (
                      <div key={product.code} className="border rounded-lg p-3 bg-green-50">
                        <div className="mb-2">
                          <div className="font-medium text-sm">{displayName}</div>
                          <div className="text-xs text-gray-600 mt-1">{product.code}</div>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleUpdateQuantity(product.code, -1)}
                              disabled={product.quantity <= (product.unitsPerBox || 80)}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <Input
                              type="number"
                              value={product.quantity}
                              onChange={(e) => {
                                const newQty = parseInt(e.target.value) || 1;
                                setScannedProducts(prev =>
                                  prev.map(p =>
                                    p.code === product.code
                                      ? { ...p, quantity: Math.max(1, newQty) }
                                      : p
                                  )
                                );
                              }}
                              className="h-8 w-20 text-center font-bold"
                              min="1"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleUpdateQuantity(product.code, 1)}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                            <span className="text-sm font-medium bg-green-100 px-3 py-1 rounded">
                              {boxes} cx / {pieces} pc
                            </span>
                          </div>
                          
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleRemoveProduct(product.code)}
                          >
                            Remover
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Botões de navegação */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              onClick={handleBackToOrigin}
              className="h-12"
            >
              Voltar
            </Button>
            <Button
              onClick={handleConfirmProducts}
              disabled={scannedProducts.length === 0}
              className="h-12"
            >
              <ArrowRight className="w-5 h-5 mr-2" />
              Avançar
            </Button>
          </div>
        </div>
      </CollectorLayout>
    );
  }

  // Etapa 3: Endereço de Destino
  if (step === "destination") {
    const totalQuantity = scannedProducts.reduce((sum, p) => sum + p.quantity, 0);
    
    return (
      <CollectorLayout title="Movimentação - Destino">
        <div className="space-y-4">
          {/* Resumo da movimentação */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-center gap-4 mb-3">
                <div className="text-center">
                  <p className="text-xs text-gray-600 mb-1">De</p>
                  <p className="font-bold text-lg">{originCode}</p>
                </div>
                <ArrowRight className="h-6 w-6 text-blue-600" />
                <div className="text-center">
                  <p className="text-xs text-gray-600 mb-1">Para</p>
                  <p className="font-bold text-lg">{destinationCode || "?"}</p>
                </div>
              </div>
              <div className="text-center text-sm text-gray-700">
                {scannedProducts.length} produto(s) • {totalQuantity} unidade(s)
              </div>
            </CardContent>
          </Card>

          {/* Campo de destino */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <Label className="text-lg font-semibold">Endereço de Destino</Label>
              <p className="text-sm text-gray-600">Escaneie ou digite o código do endereço</p>
              
              <div className="flex gap-2">
                <Input
                  ref={codeInputRef}
                  value={destinationCode}
                  onChange={(e) => setDestinationCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleConfirmMovement();
                    }
                  }}
                  placeholder="Código do endereço..."
                  className="h-12 text-base"
                  inputMode="text"
                  autoFocus
                />
                <Button
                  onClick={() => setShowScanner(true)}
                  className="h-12 px-4"
                >
                  <Camera className="w-5 h-5" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Botões de navegação */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              onClick={handleBackToProducts}
              disabled={movementMutation.isPending}
              className="h-12"
            >
              Voltar
            </Button>
            <Button
              onClick={handleConfirmMovement}
              disabled={!destinationCode.trim() || movementMutation.isPending}
              className="h-12"
            >
              {movementMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
              ) : (
                <Check className="w-5 h-5 mr-2" />
              )}
              Confirmar
            </Button>
          </div>
        </div>
      </CollectorLayout>
    );
  }

  return null;
}
