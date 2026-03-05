import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { MapPin, Package, Hash, Camera, CheckCircle2, AlertCircle, ArrowRight, Link2 } from "lucide-react";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface PickingStepModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (data: { locationCode: string; productCode: string; quantity: number }) => void;
  waveId: number; // ID da onda de picking
  item: {
    id: number;
    productName: string;
    productSku: string;
    locationCode: string;
    batch?: string;
    labelCode?: string; // Código da etiqueta armazenado no recebimento
    totalQuantity: number;
    pickedQuantity: number;
    unitsPerBox?: number; // Quantidade de unidades por caixa
  };
}

type Step = 1 | 2 | 3;

export function PickingStepModal({ isOpen, onClose, onComplete, waveId, item }: PickingStepModalProps) {
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [scannedLocation, setScannedLocation] = useState("");
  const [scannedProduct, setScannedProduct] = useState("");
  const [quantity, setQuantity] = useState<number>(1);
  const [quantityInBoxes, setQuantityInBoxes] = useState<number>(0);
  const [quantityInUnits, setQuantityInUnits] = useState<number>(1);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Mutation para associar etiqueta durante picking
  const associateLabelMutation = trpc.labels.associateInPicking.useMutation({
    onSuccess: () => {
      toast.success("Etiqueta associada automaticamente!");
      setError(null);
      setCurrentStep(3); // Avançar para etapa de quantidade
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao associar etiqueta");
      setError(error.message);
    },
  });
  
  const locationInputRef = useRef<HTMLInputElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);

  // Reset ao abrir modal
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      setScannedLocation("");
      setScannedProduct("");
      setQuantity(1);
      setQuantityInBoxes(0);
      setQuantityInUnits(1);
      setError(null);
    }
  }, [isOpen]);

  // Converter caixas para unidades
  const handleBoxesChange = (boxes: number) => {
    setQuantityInBoxes(boxes);
    if (item.unitsPerBox && item.unitsPerBox > 0) {
      const units = boxes * item.unitsPerBox;
      setQuantityInUnits(units);
      setQuantity(units);
    }
  };

  // Converter unidades para caixas
  const handleUnitsChange = (units: number) => {
    setQuantityInUnits(units);
    setQuantity(units);
    if (item.unitsPerBox && item.unitsPerBox > 0) {
      const boxes = Math.floor(units / item.unitsPerBox);
      setQuantityInBoxes(boxes);
    }
  };

  // Auto-focus no input da etapa atual
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (currentStep === 1) locationInputRef.current?.focus();
        else if (currentStep === 2) productInputRef.current?.focus();
        else if (currentStep === 3) quantityInputRef.current?.focus();
      }, 100);
    }
  }, [currentStep, isOpen]);

  const handleLocationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!scannedLocation.trim()) {
      setError("Escaneie o código do endereço");
      return;
    }

    // Validar se o endereço corresponde ao sugerido
    if (scannedLocation.trim().toUpperCase() !== item.locationCode.toUpperCase()) {
      setError(`Endereço incorreto! Esperado: ${item.locationCode}`);
      return;
    }

    setError(null);
    setCurrentStep(2);
  };

  const handleProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!scannedProduct.trim()) {
      setError("Escaneie o código do produto");
      return;
    }

    // Validar se o produto corresponde à etiqueta armazenada no recebimento
    if (item.labelCode) {
      // Se há labelCode armazenado, comparar diretamente
      if (scannedProduct.trim() !== item.labelCode.trim()) {
        setError(`Etiqueta incorreta! Esperado: ${item.labelCode}`);
        return;
      }
      // Etiqueta correta, avançar para quantidade
      setError(null);
      setCurrentStep(3);
    } else {
      // NÃO HÁ ETIQUETA VINCULADA: Associar automaticamente
      const scannedCode = scannedProduct.trim();
      
      // Validar se a etiqueta corresponde ao lote OU ao SKU
      const isMatchingBatch = item.batch && scannedCode === item.batch;
      const isMatchingSku = scannedCode.startsWith(item.productSku);
      
      if (!isMatchingBatch && !isMatchingSku) {
        setError(`Produto/Lote incorreto! Esperado SKU: ${item.productSku}${item.batch ? ` ou Lote: ${item.batch}` : ''}`);
        return;
      }
      
      // Válido - associar automaticamente
      toast.info("Associando etiqueta ao produto...");
      associateLabelMutation.mutate({
        labelCode: scannedCode,
        productSku: item.productSku,
        batch: item.batch || null,
        waveId: waveId,
      });
    }
  };

  const handleQuantitySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const remainingQuantity = item.totalQuantity - item.pickedQuantity;
    
    if (quantity <= 0) {
      setError("Quantidade deve ser maior que zero");
      return;
    }

    if (quantity > remainingQuantity) {
      setError(`Quantidade excede o restante (${remainingQuantity})`);
      return;
    }

    setError(null);
    onComplete({
      locationCode: scannedLocation,
      productCode: scannedProduct,
      quantity,
    });
  };

  const handleCameraScan = (code: string) => {
    setIsCameraOpen(false);
    
    if (currentStep === 1) {
      setScannedLocation(code);
      // Auto-submit após scan
      setTimeout(() => {
        if (code.trim().toUpperCase() === item.locationCode.toUpperCase()) {
          setError(null);
          setCurrentStep(2);
        } else {
          setError(`Endereço incorreto! Esperado: ${item.locationCode}`);
        }
      }, 100);
    } else if (currentStep === 2) {
      setScannedProduct(code);
      // Auto-submit após scan
      setTimeout(() => {
        if (item.labelCode) {
          // Comparar com labelCode armazenado
          if (code.trim() === item.labelCode.trim()) {
            setError(null);
            setCurrentStep(3);
          } else {
            setError(`Etiqueta incorreta! Esperado: ${item.labelCode}`);
          }
        } else {
          // Fallback: validar pelo SKU
          const skuLength = item.productSku.length;
          const scannedSku = code.substring(0, skuLength);
          if (scannedSku === item.productSku) {
            setError(null);
            setCurrentStep(3);
          } else {
            setError(`Produto incorreto! Esperado SKU: ${item.productSku}`);
          }
        }
      }, 100);
    }
  };

  const getStepProgress = () => {
    if (currentStep === 1) return 33;
    if (currentStep === 2) return 66;
    return 100;
  };

  const remainingQuantity = item.totalQuantity - item.pickedQuantity;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Separar Item</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Informações do Item */}
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-semibold">{item.productName}</p>
                  <p className="text-sm text-muted-foreground">SKU: {item.productSku}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>Endereço: <strong>{item.locationCode}</strong></span>
              </div>
              {item.batch && (
                <div className="flex items-center gap-2 text-sm">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <span>Lote: <strong>{item.batch}</strong></span>
                </div>
              )}
              <div className="text-sm">
                <span>Restante: <strong>{remainingQuantity} unidades</strong></span>
              </div>
            </div>

            {/* Progresso das Etapas */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Etapa {currentStep} de 3</span>
                <span className="text-muted-foreground">{getStepProgress()}%</span>
              </div>
              <Progress value={getStepProgress()} className="h-2" />
            </div>

            {/* Etapa 1: Escanear Endereço */}
            {currentStep === 1 && (
              <form onSubmit={handleLocationSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-lg">
                    <MapPin className="h-5 w-5 text-primary" />
                    Etapa 1: Escanear Endereço
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Escaneie a etiqueta do endereço <strong>{item.locationCode}</strong>
                  </p>
                </div>

                <div className="flex gap-2">
                  <Input
                    ref={locationInputRef}
                    type="text"
                    placeholder="Código do endereço..."
                    value={scannedLocation}
                    onChange={(e) => setScannedLocation(e.target.value)}
                    className="flex-1 text-lg"
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setIsCameraOpen(true)}
                  >
                    <Camera className="h-5 w-5" />
                  </Button>
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-700 border border-red-500/20">
                    <AlertCircle className="h-5 w-5 flex-shrink-0" />
                    <p className="text-sm font-medium">{error}</p>
                  </div>
                )}

                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={onClose}>
                    Cancelar
                  </Button>
                  <Button type="submit">
                    Próximo
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </form>
            )}

            {/* Etapa 2: Escanear Produto */}
            {currentStep === 2 && (
              <form onSubmit={handleProductSubmit} className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span className="text-sm text-muted-foreground">Endereço confirmado: {scannedLocation}</span>
                  </div>
                  
                  <Label className="flex items-center gap-2 text-lg">
                    <Package className="h-5 w-5 text-primary" />
                    Etapa 2: Escanear Produto
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {item.labelCode ? (
                      <>Escaneie a etiqueta do produto: <strong>{item.labelCode}</strong></>
                    ) : (
                      <>Escaneie a etiqueta do produto <strong>{item.productSku}</strong></>
                    )}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Input
                    ref={productInputRef}
                    type="text"
                    placeholder="Código do produto..."
                    value={scannedProduct}
                    onChange={(e) => setScannedProduct(e.target.value)}
                    className="flex-1 text-lg"
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setIsCameraOpen(true)}
                  >
                    <Camera className="h-5 w-5" />
                  </Button>
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-700 border border-red-500/20">
                    <AlertCircle className="h-5 w-5 flex-shrink-0" />
                    <p className="text-sm font-medium">{error}</p>
                  </div>
                )}

                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setCurrentStep(1)}>
                    Voltar
                  </Button>
                  <Button type="submit">
                    Próximo
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </form>
            )}

            {/* Etapa 3: Informar Quantidade */}
            {currentStep === 3 && (
              <form onSubmit={handleQuantitySubmit} className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span className="text-sm text-muted-foreground">Endereço: {scannedLocation}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span className="text-sm text-muted-foreground">Produto: {scannedProduct.substring(0, 7)}</span>
                  </div>
                  
                  <Label className="flex items-center gap-2 text-lg">
                    <Hash className="h-5 w-5 text-primary" />
                    Etapa 3: Informar Quantidade
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Digite a quantidade separada (máximo: {remainingQuantity})
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Exibir campos duais se produto tiver unitsPerBox */}
                  {item.unitsPerBox && item.unitsPerBox > 0 ? (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        {/* Campo de Caixas */}
                        <div className="space-y-2">
                          <Label htmlFor="boxes" className="text-sm font-medium">
                            Caixas
                          </Label>
                          <Input
                            id="boxes"
                            type="number"
                            min="0"
                            placeholder="0"
                            value={quantityInBoxes || ""}
                            onChange={(e) => handleBoxesChange(parseInt(e.target.value) || 0)}
                            className="text-lg text-center font-semibold"
                          />
                          <p className="text-xs text-muted-foreground text-center">
                            {item.unitsPerBox} un/caixa
                          </p>
                        </div>

                        {/* Campo de Unidades */}
                        <div className="space-y-2">
                          <Label htmlFor="units" className="text-sm font-medium">
                            Unidades
                          </Label>
                          <Input
                            ref={quantityInputRef}
                            id="units"
                            type="number"
                            min="1"
                            max={remainingQuantity}
                            placeholder="1"
                            value={quantityInUnits || ""}
                            onChange={(e) => handleUnitsChange(parseInt(e.target.value) || 0)}
                            className="text-lg text-center font-semibold"
                            autoFocus
                          />
                          <p className="text-xs text-muted-foreground text-center">
                            Máx: {remainingQuantity}
                          </p>
                        </div>
                      </div>

                      {/* Feedback visual da conversão */}
                      {quantityInUnits > 0 && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <p className="text-sm text-blue-900 text-center">
                            <strong>{quantityInBoxes} caixa(s)</strong> + <strong>{quantityInUnits % (item.unitsPerBox || 1)} unidade(s)</strong> = <strong className="text-blue-700">{quantityInUnits} unidades</strong>
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    /* Fallback: campo único se não houver unitsPerBox */
                    <div className="space-y-2">
                      <Label htmlFor="quantity" className="text-sm font-medium">
                        Quantidade (unidades)
                      </Label>
                      <Input
                        ref={quantityInputRef}
                        id="quantity"
                        type="number"
                        min="1"
                        max={remainingQuantity}
                        placeholder="Quantidade..."
                        value={quantity}
                        onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                        className="text-lg text-center font-semibold"
                        autoFocus
                      />
                      
                      {/* Botões rápidos */}
                      <div className="grid grid-cols-4 gap-2">
                        {[1, 5, 10, remainingQuantity].map((value) => (
                          <Button
                            key={value}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setQuantity(value)}
                            disabled={value > remainingQuantity}
                          >
                            {value === remainingQuantity ? "Tudo" : value}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-700 border border-red-500/20">
                    <AlertCircle className="h-5 w-5 flex-shrink-0" />
                    <p className="text-sm font-medium">{error}</p>
                  </div>
                )}

                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setCurrentStep(2)}>
                    Voltar
                  </Button>
                  <Button type="submit" className="bg-green-600 hover:bg-green-700">
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Confirmar Separação
                  </Button>
                </div>
              </form>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Scanner de Câmera */}
      {isCameraOpen && (
        <BarcodeScanner
          onScan={handleCameraScan}
          onClose={() => setIsCameraOpen(false)}
        />
      )}


    </>
  );
}
