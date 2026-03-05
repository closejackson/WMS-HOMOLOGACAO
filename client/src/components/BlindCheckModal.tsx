import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Loader2, CheckCircle2, AlertCircle, Camera, Undo, Edit, Home } from "lucide-react";
import { toast } from "sonner";
import { BarcodeScanner } from "./BarcodeScanner";
import { useLocation } from "wouter";
import { formatDateBR, brToISO } from "@/lib/dateUtils";

interface BlindCheckModalProps {
  open: boolean;
  onClose: () => void;
  receivingOrderId: number;
  items: Array<{
    id: number;
    productId: number;
    expectedQuantity: number;
    receivedQuantity: number;
    expectedGtin?: string | null;
    productSku?: string | null;
    productDescription?: string | null;
    batch?: string | null;
    expiryDate?: string | null;
  }>;
}

export function BlindCheckModal({ open, onClose, receivingOrderId, items }: BlindCheckModalProps) {
  const [conferenceId, setConferenceId] = useState<number | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [labelCode, setLabelCode] = useState("");
  const [showAssociationDialog, setShowAssociationDialog] = useState(false);
  const [showFinishDialog, setShowFinishDialog] = useState(false);
  const [pendingLabelCode, setPendingLabelCode] = useState("");
  
  // Campos de associação
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [batch, setBatch] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [unitsPerBox, setUnitsPerPackage] = useState<number>(1);
  const [totalUnitsReceived, setTotalUnitsReceived] = useState<number>(0);
  
  // Estado efêmero para rastrear último item bipado (para undo)
  const [lastSuccessfulItem, setLastSuccessfulItem] = useState<{
    productId: number;
    batch: string;
    scannedCode: string;
  } | null>(null);
  
  const labelInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();

  // Buscar dados do produto selecionado
  const { data: selectedProduct } = trpc.products.getById.useQuery(
    { id: selectedProductId! },
    { enabled: !!selectedProductId }
  );

  // Preencher unitsPerBox e totalUnitsReceived automaticamente quando produto for selecionado
  useEffect(() => {
    if (selectedProduct?.unitsPerBox) {
      setUnitsPerPackage(selectedProduct.unitsPerBox);
      setTotalUnitsReceived(selectedProduct.unitsPerBox); // Pré-preencher com 1 caixa completa
    } else {
      setUnitsPerPackage(1); // Valor padrão se não houver cadastrado
      setTotalUnitsReceived(1);
    }
  }, [selectedProduct]);

  // Preencher validade automaticamente quando lote for informado
  useEffect(() => {
    if (selectedProductId && batch) {
      // Buscar item da ordem com mesmo produto e lote
      const matchingItem = items.find(item => 
        item.productId === selectedProductId
      );
      
      if (matchingItem) {
        // Buscar validade do receivingOrderItem via query
        utils.receiving.getItemByProductAndBatch.fetch({
          receivingOrderId,
          productId: selectedProductId,
          batch
        }).then(itemData => {
          if (itemData?.expiryDate) {
            // Converter timestamp para formato YYYY-MM-DD
            const date = new Date(itemData.expiryDate);
            const formattedDate = date.toISOString().split('T')[0];
            setExpiryDate(formattedDate);
          }
        }).catch(() => {
          // Ignorar erro se não encontrar
        });
      }
    }
  }, [selectedProductId, batch, items, receivingOrderId, utils]);

  // Iniciar sessão ao abrir modal
  const startSessionMutation = trpc.blindConference.start.useMutation({
    onSuccess: (data) => {
      setConferenceId(data.sessionId);
      toast.success(data.message);
    },
    onError: (error: any) => {
      toast.error("Erro ao iniciar conferência", {
        description: error.message,
      });
    },
  });

  // Ler etiqueta
  const readLabelMutation = trpc.blindConference.readLabel.useMutation({
    onSuccess: (data) => {
      if (data.isNewLabel) {
        // Etiqueta nova - abrir diálogo de associação
        setPendingLabelCode(labelCode);
        setShowAssociationDialog(true);
        
        // Pré-selecionar primeiro produto se houver apenas um
        if (items.length === 1) {
          setSelectedProductId(items[0].productId);
        }
      } else {
        // Etiqueta já associada - incrementou automaticamente
        
        // Salvar último item bipado para undo
        if (data.association) {
          setLastSuccessfulItem({
            productId: data.association.productId,
            batch: data.association.batch || "",
            scannedCode: labelCode,
          });
        }
        
        toast.success("Etiqueta lida com sucesso!", {
          description: `${data.association?.productName} - ${data.association?.packagesRead} volumes (${data.association?.totalUnits} unidades)`,
        });
        setLabelCode("");
        labelInputRef.current?.focus();
        
        // Atualizar resumo
        utils.blindConference.getSummary.invalidate({ conferenceId: conferenceId! });
      }
    },
    onError: (error: any) => {
      toast.error("Erro ao ler etiqueta", {
        description: error.message,
      });
    },
  });

  // Associar etiqueta
  const associateLabelMutation = trpc.blindConference.associateLabel.useMutation({
    onSuccess: (data) => {
      toast.success("Etiqueta associada com sucesso!", {
        description: `${data.association.productName} - ${data.association.totalUnits} unidades`,
      });
      
      // Limpar campos
      setShowAssociationDialog(false);
      setPendingLabelCode("");
      setSelectedProductId(null);
      setBatch("");
      setExpiryDate("");
      setUnitsPerPackage(1);
      setTotalUnitsReceived(0);
      setLabelCode("");
      
      // Retornar foco
      labelInputRef.current?.focus();
      
      // Atualizar resumo
      utils.blindConference.getSummary.invalidate({ conferenceId: conferenceId! });
    },
    onError: (error: any) => {
      toast.error("Erro ao associar etiqueta", {
        description: error.message,
      });
    },
  });

  // Desfazer última leitura
  const undoLastReadingMutation = trpc.blindConference.undoLastReading.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      utils.blindConference.getSummary.invalidate({ conferenceId: conferenceId! });
    },
    onError: (error: any) => {
      toast.error("Erro ao desfazer leitura", {
        description: error.message,
      });
    },
  });

  // Obter resumo
  const { data: summary, isLoading: isLoadingSummary } = trpc.blindConference.getSummary.useQuery(
    { conferenceId: conferenceId! },
    { enabled: !!conferenceId, refetchInterval: 3000 }
  );

  // Finalizar conferência
  const finishMutation = trpc.blindConference.finish.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      utils.receiving.list.invalidate();
      utils.receiving.getItems.invalidate({ receivingOrderId: receivingOrderId });
      onClose();
      setLocation("/recebimento");
    },
    onError: (error: any) => {
      toast.error("Erro ao finalizar conferência", {
        description: error.message,
      });
    },
  });

  // Iniciar sessão ao abrir modal
  useEffect(() => {
    if (open && !conferenceId) {
      startSessionMutation.mutate({ receivingOrderId });
    }
  }, [open, receivingOrderId]);

  // Foco automático
  useEffect(() => {
    if (open && !showAssociationDialog) {
      setTimeout(() => labelInputRef.current?.focus(), 100);
    }
  }, [open, showAssociationDialog]);

  const handleLabelSubmit = () => {
    if (!labelCode.trim()) {
      toast.error("Digite ou escaneie um código de etiqueta");
      return;
    }

    if (!conferenceId) {
      toast.error("Sessão não iniciada");
      return;
    }

    readLabelMutation.mutate({
      conferenceId,
      labelCode: labelCode.trim(),
    });
  };

  const handleScanSuccess = (code: string) => {
    setLabelCode(code);
    setShowScanner(false);
    
    // Processar automaticamente
    if (conferenceId) {
      readLabelMutation.mutate({
        conferenceId,
        labelCode: code,
      });
    }
  };

  const handleAssociate = () => {
    if (!selectedProductId) {
      toast.error("Selecione um produto");
      return;
    }

    if (unitsPerBox < 1) {
      toast.error("Unidades por caixa deve ser maior que zero");
      return;
    }

    if (totalUnitsReceived < 1) {
      toast.error("Quantidade recebida deve ser maior que zero");
      return;
    }

    // Converter data do formato brasileiro dd/MM/yyyy para ISO yyyy-MM-dd antes de enviar
    const expiryDateISO = expiryDate ? brToISO(expiryDate) : null;
    
    // Encontrar o receivingOrderItemId a partir do productId selecionado
    const matchingItem = items.find(i => i.productId === selectedProductId);
    if (!matchingItem) {
      toast.error("Item não encontrado na ordem de recebimento");
      return;
    }
    associateLabelMutation.mutate({
      conferenceId: conferenceId!,
      labelCode: pendingLabelCode,
      receivingOrderItemId: matchingItem.id,
      productId: selectedProductId,
      batch: batch || null,
      expiryDate: expiryDateISO,
      unitsPerBox,
      totalUnitsReceived, // Enviar quantidade fracionada
    });
  };

  const handleUndo = () => {
    if (!conferenceId || !lastSuccessfulItem) {
      toast.error("Nenhum item para desfazer");
      return;
    }
    
    undoLastReadingMutation.mutate({
      conferenceId,
      productId: lastSuccessfulItem.productId,
      batch: lastSuccessfulItem.batch,
    }, {
      onSuccess: () => {
        setLastSuccessfulItem(null); // Limpa para evitar múltiplos undos
        toast.info("Leitura estornada com sucesso");
      }
    });
  };

  const handleFinishClick = () => {
    if (!summary?.conferenceItems.length) {
      toast.error("Nenhuma etiqueta foi lida ainda");
      return;
    }
    setShowFinishDialog(true);
  };

  const handleConfirmFinish = () => {
    if (!conferenceId) return;
    finishMutation.mutate({ conferenceId });
  };

  // Calcular métricas
  const totalVolumes = summary?.conferenceItems.reduce((sum: number, item: any) => sum + item.packagesRead, 0) || 0;
  const totalUnits = summary?.conferenceItems.reduce((sum: number, item: any) => sum + (item.unitsRead || 0), 0) || 0; // Usar unitsRead do backend
  const distinctProducts = new Set(summary?.conferenceItems.map((item: any) => item.productId)).size || 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-1 h-8 bg-blue-600 rounded"></div>
                <div>
                  <DialogTitle className="text-2xl">Conferência Cega - Ordem #{receivingOrderId}</DialogTitle>
                  <p className="text-sm text-gray-600">Leia as etiquetas para conferir os volumes recebidos</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/")}
                className="gap-2"
              >
                <Home className="w-4 h-4" />
                Voltar
              </Button>
            </div>
          </DialogHeader>

          {!conferenceId ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <span className="ml-2">Iniciando sessão...</span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Métricas */}
              <div className="grid grid-cols-3 gap-2 sm:gap-4">
                <Card>
                  <CardContent className="p-3 sm:p-6">
                    <div className="text-xs sm:text-sm text-gray-600 mb-1">Volumes Lidos</div>
                    <div className="text-xl sm:text-3xl font-bold">{totalVolumes}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 sm:p-6">
                    <div className="text-xs sm:text-sm text-gray-600 mb-1">Unidades Totais</div>
                    <div className="text-xl sm:text-3xl font-bold">{totalUnits}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 sm:p-6">
                    <div className="text-xs sm:text-sm text-gray-600 mb-1">Produtos Distintos</div>
                    <div className="text-xl sm:text-3xl font-bold">{distinctProducts}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Leitura de Etiquetas */}
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <div className="mb-3">
                    <Label className="text-base font-semibold">Leitura de Etiquetas</Label>
                    <p className="text-xs sm:text-sm text-gray-600">Escaneie ou digite o código da etiqueta</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 mb-3">
                    <Input
                      ref={labelInputRef}
                      value={labelCode}
                      onChange={(e) => setLabelCode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleLabelSubmit();
                        }
                      }}
                      placeholder="Código da etiqueta..."
                      className="flex-1 text-base sm:text-lg h-12 sm:h-auto"
                      disabled={readLabelMutation.isPending}
                      inputMode="numeric"
                    />
                    <Button
                      onClick={handleLabelSubmit}
                      disabled={readLabelMutation.isPending || !labelCode.trim()}
                      size="lg"
                      className="w-full sm:w-auto min-h-[48px]"
                    >
                      {readLabelMutation.isPending ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        "Ler"
                      )}
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setShowScanner(true)}
                    className="w-full sm:w-auto min-h-[48px]"
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    Escanear com Câmera
                  </Button>
                </CardContent>
              </Card>

              {/* Produtos Conferidos */}
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <div className="mb-4">
                    <h3 className="text-base font-semibold">Produtos Conferidos</h3>
                    <p className="text-xs sm:text-sm text-gray-600">Resumo das associações e quantidades lidas</p>
                  </div>

                  {isLoadingSummary ? (
                    <div className="text-center py-8 text-gray-500">Carregando...</div>
                  ) : !summary?.conferenceItems.length ? (
                    <div className="text-center py-8 sm:py-12 text-gray-500">
                      <p className="text-base sm:text-lg mb-2">Nenhum produto conferido ainda</p>
                      <p className="text-xs sm:text-sm">Escaneie ou digite o código da primeira etiqueta para começar</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto -mx-4 sm:mx-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Produto</TableHead>
                            <TableHead>Lote</TableHead>
                            <TableHead className="text-right">Un/Volume</TableHead>
                            <TableHead className="text-right">Volumes</TableHead>
                            <TableHead className="text-right">Unidades</TableHead>
                            <TableHead className="text-center">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {summary.conferenceItems.map((item: any) => (
                            <TableRow key={`${item.productId}-${item.batch}`}>
                              <TableCell>
                                <div className="font-medium">{item.productName}</div>
                                <div className="text-sm text-gray-600">{item.productSku}</div>
                              </TableCell>
                              <TableCell>{item.batch || "-"}</TableCell>
                              <TableCell className="text-right">-</TableCell>
                              <TableCell className="text-right font-semibold">
                                {item.packagesRead} caixas
                                <div className="text-sm text-gray-600">({item.unitsRead || 0} unidades)</div>
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                {item.packagesRead} caixas
                                <div className="text-sm text-gray-600">({item.unitsRead || 0} unidades)</div>
                              </TableCell>
                              <TableCell className="text-center">
                                <Button variant="ghost" size="icon">
                                  <Edit className="w-4 h-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Ações */}
              <div className="flex flex-col sm:flex-row gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={handleUndo}
                  disabled={!summary?.conferenceItems.length || undoLastReadingMutation.isPending}
                  className="min-h-[48px] w-full sm:w-auto"
                >
                  <Undo className="w-4 h-4 mr-2" />
                  Desfazer Última
                </Button>
                <Button
                  onClick={handleFinishClick}
                  disabled={!summary?.conferenceItems.length}
                  className="bg-blue-600 hover:bg-blue-700 min-h-[48px] w-full sm:w-auto"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Finalizar Conferência
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de Associação */}
      <Dialog open={showAssociationDialog} onOpenChange={setShowAssociationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Associar Etiqueta a Produto</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">Etiqueta</Label>
              <Input value={pendingLabelCode} disabled className="bg-gray-100" />
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">Produto *</Label>
              <Select
                // ✅ Mapeamento REVERSO: busca qual item corresponde ao productId selecionado
                value={items.find(item => item.productId === selectedProductId)?.id.toString() || ""}
                onValueChange={(value) => {
                  // Locali                onValueChange={(value) => {
                  const selectedItem = items.find(item => item.id.toString() === value);
                  console.log('🔍 Item selecionado:', selectedItem);
                  if (selectedItem) {
                    setSelectedProductId(selectedItem.productId);
                    
                    // Preencher automaticamente lote e validade do item da ordem
                    if (selectedItem.batch) {
                      console.log('✅ Preenchendo lote:', selectedItem.batch);
                      setBatch(selectedItem.batch);
                    }
                    
                    if (selectedItem.expiryDate) {
                      console.log('📅 expiryDate original:', selectedItem.expiryDate);
                      // Converter para formato brasileiro dd/MM/yyyy
                      const formattedDate = formatDateBR(selectedItem.expiryDate);
                      console.log('📅 Data formatada BR:', formattedDate);
                      setExpiryDate(formattedDate);
                    } else {
                      console.log('⚠️ expiryDate está vazio ou null');
                    }
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o produto" />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem key={item.id} value={item.id.toString()}>
                      {item.productDescription} ({item.productSku}) - Lote: {item.batch || 'S/L'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium mb-2 block">Lote (opcional)</Label>
                <Input
                  value={batch}
                  onChange={(e) => setBatch(e.target.value)}
                  placeholder="Ex: 25H04LB356"
                />
              </div>

              <div>
                <Label className="text-sm font-medium mb-2 block">Validade (opcional)</Label>
                <Input
                  type="text"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  placeholder="dd/MM/aaaa"
                  maxLength={10}
                />
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">Unidades por Caixa (Cadastro) *</Label>
              <Input
                type="number"
                min="1"
                value={unitsPerBox}
                onChange={(e) => {
                  const newValue = Number(e.target.value);
                  setUnitsPerPackage(newValue);
                  setTotalUnitsReceived(newValue); // Atualizar quantidade recebida também
                }}
                placeholder="Ex: 160"
                className="bg-gray-50"
              />
              <p className="text-xs text-gray-500 mt-1">Quantidade padrão de unidades por caixa fechada</p>
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">Quantidade Recebida (Unidades) *</Label>
              <Input
                type="number"
                min="1"
                value={totalUnitsReceived}
                onChange={(e) => setTotalUnitsReceived(Number(e.target.value))}
                placeholder="Ex: 80 (caixa incompleta)"
                className="font-semibold text-lg"
              />
              <p className="text-xs text-gray-500 mt-1">
                Edite este valor para registrar caixas incompletas/fracionadas
              </p>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowAssociationDialog(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleAssociate}
                disabled={!selectedProductId || associateLabelMutation.isPending}
              >
                {associateLabelMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Associar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Finalização */}
      <Dialog open={showFinishDialog} onOpenChange={setShowFinishDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Finalizar Conferência</DialogTitle>
            <p className="text-sm text-gray-600">Revise o resumo antes de finalizar</p>
          </DialogHeader>

          <div className="space-y-6">
            {/* Métricas do resumo */}
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-3xl font-bold">{totalVolumes}</div>
                <div className="text-sm text-gray-600">Volumes</div>
              </div>
              <div>
                <div className="text-3xl font-bold">{totalUnits}</div>
                <div className="text-sm text-gray-600">Unidades</div>
              </div>
              <div>
                <div className="text-3xl font-bold">{distinctProducts}</div>
                <div className="text-sm text-gray-600">Produtos</div>
              </div>
            </div>

            {/* Tabela de resumo com divergências */}
            {summary && summary.conferenceItems.length > 0 && (
              <div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Conferido</TableHead>
                      <TableHead className="text-right">Esperado</TableHead>
                      <TableHead className="text-right">Divergência</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.conferenceItems.map((item: any, idx: any) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <div className="font-medium">{item.productName}</div>
                          {item.batch && (
                            <div className="text-sm text-gray-600">Lote: {item.batch}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{item.quantityConferenced}</TableCell>
                        <TableCell className="text-right">{item.quantityExpected}</TableCell>
                        <TableCell className="text-right">
                          {item.divergence === 0 ? (
                            <span className="inline-flex items-center gap-1 text-green-600">
                              <CheckCircle2 className="w-4 h-4" />
                              OK
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-yellow-600">
                              <AlertCircle className="w-4 h-4" />
                              {item.divergence > 0 ? "+" : ""}{item.divergence}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Ações */}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowFinishDialog(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmFinish}
                disabled={finishMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {finishMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                )}
                Confirmar Finalização
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Scanner via Câmera */}
      {showScanner && (
        <BarcodeScanner
          onScan={handleScanSuccess}
          onClose={() => setShowScanner(false)}
        />
      )}
    </>
  );
}
