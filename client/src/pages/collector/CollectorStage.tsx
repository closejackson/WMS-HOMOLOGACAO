/**
 * CollectorStage — Conferência de expedição com validação de lote
 *
 * Implementa a spec "Parte 2 — /collector/stage: Validação de lote na conferência".
 * A validação em si ocorre no servidor (server/stage.ts → recordStageItem).
 * Este componente exibe o feedback de erro de lote de forma clara e bloqueante
 * para que o operador saiba que precisa bipar a etiqueta correta.
 *
 * Regras:
 *  • Item sem lote cadastrado → prossegue normalmente (sem mudança)
 *  • Item com lote cadastrado + etiqueta sem lote → ERRO bloqueante
 *  • Item com lote cadastrado + lote divergente → ERRO bloqueante
 *  • Item com lote cadastrado + lote correto → OK, saldo decrementado
 *
 * Lock/Timeout:
 *  • Ao iniciar conferência, o pedido é travado para o usuário atual
 *  • Heartbeat a cada 30s mantém o lock ativo
 *  • Inatividade > 10 min libera o lock automaticamente (servidor)
 *  • Modal de abandono ao tentar sair com conferência em andamento
 *  • Alerta visual se outro usuário está conferindo o pedido
 */

import { useState, useRef, useEffect } from "react";
import { CollectorLayout } from "../../components/CollectorLayout";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { BarcodeScanner } from "../../components/BarcodeScanner";
import { trpc } from "../../lib/trpc";
import { toast } from "sonner";
import {
  Camera,
  XCircle,
  AlertCircle,
  Scan,
  Undo2,
  Lock,
  LogOut,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../components/ui/dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScannedItem {
  productCode: string;
  productName: string;
  quantity: number;
  checkedQuantity: number;
  remainingQuantity: number;
  batch: string | null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function CollectorStage() {
  const [showScanner, setShowScanner] = useState(false);
  const [currentField, setCurrentField] = useState<"order" | "product" | null>(
    null
  );

  const [orderNumber, setOrderNumber] = useState("");
  const [checkId, setCheckId] = useState<number | null>(null);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);

  // Lote — erro visual bloqueante
  const [lotErrorData, setLotErrorData] = useState<{
    message: string;
    expected?: string;
    received?: string;
  } | null>(null);

  // Modal de item fracionado
  const [showFractionalModal, setShowFractionalModal] = useState(false);
  const [fractionalData, setFractionalData] = useState<any>(null);
  const [fractionalQuantity, setFractionalQuantity] = useState("");

  // Modal de volume
  const [showVolumeModal, setShowVolumeModal] = useState(false);
  const [volumeQuantity, setVolumeQuantity] = useState("");

  // ── Lock/Timeout state ─────────────────────────────────────────────────────
  // Alerta de pedido bloqueado por outro usuário
  const [lockConflict, setLockConflict] = useState<{
    lockedByName: string;
    minutesAgo: number;
  } | null>(null);

  // Modal de abandono: mostrado quando usuário tenta sair com conferência ativa
  const [showAbandonModal, setShowAbandonModal] = useState(false);

  // Ref para o checkId (usado nos effects sem re-render)
  const checkIdRef = useRef<number | null>(null);
  useEffect(() => {
    checkIdRef.current = checkId;
  }, [checkId]);

  const [manualLabelCode, setManualLabelCode] = useState("");
  const productInputRef = useRef<HTMLInputElement>(null);

  // Pilha LIFO para desfazer bipagens no stage
  const [undoStack, setUndoStack] = useState<Array<{
    stageCheckItemId: number;
    quantityAdded: number;
    productName: string;
  }>>([]);

  // ── Mutations de lock ──────────────────────────────────────────────────────
  const heartbeatMut = trpc.stage.stageHeartbeat.useMutation();
  const releaseLockMut = trpc.stage.releaseStageLock.useMutation();

  // ── Heartbeat: manter lock ativo a cada 30 segundos ───────────────────────
  useEffect(() => {
    if (!checkId) return;

    const interval = setInterval(() => {
      if (checkIdRef.current) {
        heartbeatMut.mutate({ stageCheckId: checkIdRef.current });
      }
    }, 30_000); // 30 segundos

    return () => clearInterval(interval);
  }, [checkId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── beforeunload: avisar antes de fechar/recarregar a aba ─────────────────
  useEffect(() => {
    if (!checkId) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Você tem uma conferência em andamento. Deseja sair?";
      return e.returnValue;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [checkId]);

  // ── Queries ────────────────────────────────────────────────────────────────
  const orderQuery = trpc.stage.getOrderForStage.useQuery(
    { customerOrderNumber: orderNumber },
    { enabled: !!orderNumber && !checkId }
  );

  // ── Mutations ──────────────────────────────────────────────────────────────
  const startCheckMut = trpc.stage.startStageCheck.useMutation({
    onSuccess: (data: any) => {
      setCheckId(data.stageCheckId);
      setLockConflict(null);
      if (data.resumed) {
        toast.info(data.message);
      } else {
        toast.success("Conferência iniciada!");
      }
      setTimeout(() => productInputRef.current?.focus(), 200);
    },
    onError: (err: any) => {
      // Detectar conflito de lock (outro usuário está conferindo)
      const cause = (err as any)?.data?.cause ?? (err as any)?.cause;
      if (err.message?.includes("sendo conferido por") || cause?.lockedByName) {
        setLockConflict({
          lockedByName: cause?.lockedByName ?? "outro usuário",
          minutesAgo: cause?.minutesAgo ?? 0,
        });
      } else {
        toast.error(err.message);
      }
    },
  });

  const recordItemMut = trpc.stage.recordStageItem.useMutation({
    onSuccess: (data: any) => {
      // Limpar erro de lote (bipagem foi aceita)
      setLotErrorData(null);

      if (data.isFractional) {
        setFractionalData(data);
        setShowFractionalModal(true);
      } else {
        toast.success(data.message);
        // Empilhar bipagem na pilha LIFO
        if (data.stageCheckItemId) {
          setUndoStack(prev => [...prev, {
            stageCheckItemId: data.stageCheckItemId,
            quantityAdded: data.quantityAdded,
            productName: data.productName,
          }]);
        }
        setScannedItems((prev) => {
          const exists = prev.findIndex(
            (i) => i.productCode === data.productSku && i.batch === (data.batch ?? null)
          );
          const updated: ScannedItem = {
            productCode: data.productSku,
            productName: data.productName,
            quantity: data.quantityAdded,
            checkedQuantity: data.checkedQuantity,
            remainingQuantity: data.remainingQuantity,
            batch: data.batch ?? null,
          };
          if (exists !== -1) {
            const next = [...prev];
            next[exists] = updated;
            return next;
          }
          return [...prev, updated];
        });
        setTimeout(() => productInputRef.current?.focus(), 100);
      }
    },
    onError: (err: any) => {
      const msg: string = err.message ?? "";

      // Detectar erros de lote para exibir feedback bloqueante
      if (
        msg.toLowerCase().includes("lote") ||
        msg.toLowerCase().includes("batch")
      ) {
        setLotErrorData({ message: msg });
        setManualLabelCode("");
        setTimeout(() => productInputRef.current?.focus(), 100);
      } else {
        toast.error(msg, { duration: 4000 });
        setManualLabelCode("");
        setTimeout(() => productInputRef.current?.focus(), 100);
      }
    },
  });

  const completeCheckMut = trpc.stage.completeStageCheck.useMutation({
    onSuccess: (data: any) => {
      if (data.divergences && data.divergences.length > 0) {
        toast.warning(
          `Conferência finalizada com ${data.divergences.length} divergência(s)`
        );
      } else {
        toast.success("Conferência finalizada com sucesso!");
      }
      // Lock é liberado automaticamente pelo servidor ao completar
      setShowVolumeModal(true);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const undoMut = trpc.stage.undoLastStageItem.useMutation({
    onSuccess: (data: any) => {
      setUndoStack(prev => prev.slice(0, -1));
      setScannedItems(prev => prev.map(item =>
        item.productName === data.productName
          ? { ...item, checkedQuantity: data.newCheckedQuantity, remainingQuantity: data.newRemainingQuantity }
          : item
      ).filter(item => item.checkedQuantity > 0));
      toast.info(data.message);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleUndo = () => {
    if (undoStack.length === 0) {
      toast.error("Nenhuma bipagem para desfazer");
      return;
    }
    if (!checkId) {
      toast.error("Conferência não iniciada");
      return;
    }
    const top = undoStack[undoStack.length - 1];
    undoMut.mutate({
      stageCheckId: checkId,
      stageCheckItemId: top.stageCheckItemId,
      quantityToUndo: top.quantityAdded,
    });
  };

  const generateLabelsMut = trpc.stage.generateVolumeLabels.useMutation();

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleScan(code: string) {
    setShowScanner(false);
    setCurrentField(null);

    if (currentField === "order") {
      setOrderNumber(code);
      toast.success(`Pedido escaneado: ${code}`);
    } else if (currentField === "product") {
      submitProductCode(code);
    }
  }

  function submitProductCode(code: string) {
    if (!checkId) {
      toast.error("Inicie a conferência primeiro");
      return;
    }
    setLotErrorData(null);
    recordItemMut.mutate({
      stageCheckId: checkId,
      labelCode: code,
      autoIncrement: true,
    });
  }

  function handleStartCheck() {
    if (!orderNumber || !orderQuery.data) {
      toast.error("Informe o número do pedido");
      return;
    }
    startCheckMut.mutate({
      pickingOrderId: orderQuery.data.order.id,
      customerOrderNumber: orderNumber,
    });
  }

  function handleRecordFractional() {
    const qty = parseInt(fractionalQuantity);
    if (!qty || qty <= 0) {
      toast.error("Informe uma quantidade válida");
      return;
    }
    if (!checkId || !fractionalData) {
      toast.error("Dados inválidos");
      return;
    }
    recordItemMut.mutate({
      stageCheckId: checkId,
      labelCode: fractionalData.labelCode,
      quantity: qty,
      autoIncrement: false,
    });
    setShowFractionalModal(false);
    setFractionalData(null);
    setFractionalQuantity("");
  }

  function handleCompleteCheck() {
    if (!checkId) return;
    if (scannedItems.length === 0) {
      toast.error("Escaneie pelo menos um item antes de finalizar");
      return;
    }
    completeCheckMut.mutate({ stageCheckId: checkId });
  }

  async function handleGenerateLabels() {
    const qty = parseInt(volumeQuantity);
    if (!qty || qty <= 0) {
      toast.error("Informe uma quantidade válida de volumes");
      return;
    }
    try {
      const result = await generateLabelsMut.mutateAsync({
        customerOrderNumber: orderNumber,
        customerName: orderQuery.data?.order?.customerName || "N/A",
        tenantName: orderQuery.data?.tenantName || "N/A",
        totalVolumes: qty,
      });

      const byteChars = atob(result.pdfBase64);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Etiquetas geradas!");
      handleNewOrder();
    } catch (error: any) {
      toast.error(error.message || "Erro ao gerar etiquetas");
    }
  }

  function handleNewOrder() {
    setShowVolumeModal(false);
    setVolumeQuantity("");
    setOrderNumber("");
    setCheckId(null);
    setScannedItems([]);
    setLotErrorData(null);
    setManualLabelCode("");
    setUndoStack([]);
    setLockConflict(null);
  }

  /**
   * Abandono voluntário: libera o lock e volta para novo pedido
   */
  function handleAbandonConference() {
    if (checkIdRef.current) {
      releaseLockMut.mutate({ stageCheckId: checkIdRef.current });
    }
    setShowAbandonModal(false);
    handleNewOrder();
    toast.info("Conferência abandonada. O pedido foi liberado para outros conferentes.");
  }

  /**
   * Solicita abandono: mostra modal de confirmação
   */
  function requestAbandon() {
    if (checkId) {
      setShowAbandonModal(true);
    } else {
      handleNewOrder();
    }
  }

  // ── Scanner ───────────────────────────────────────────────────────────────
  if (showScanner) {
    return (
      <BarcodeScanner
        onScan={handleScan}
        onClose={() => {
          setShowScanner(false);
          setCurrentField(null);
        }}
      />
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <CollectorLayout title="Stage — Conferência">
      <div className="space-y-4">
        {/* ── Seleção de Pedido ─────────────────────────────────────────── */}
        {!checkId ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Número do Pedido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Ex: 0001"
                  value={orderNumber}
                  onChange={(e) => {
                    setOrderNumber(e.target.value);
                    setLockConflict(null); // Limpar conflito ao trocar pedido
                  }}
                  className="h-12 text-lg"
                />
                <Button
                  type="button"
                  size="lg"
                  onClick={() => {
                    setCurrentField("order");
                    setShowScanner(true);
                  }}
                  className="h-12 px-4"
                >
                  <Camera className="h-5 w-5" />
                </Button>
              </div>

              {orderQuery.isLoading && (
                <p className="text-sm text-muted-foreground">
                  Carregando pedido...
                </p>
              )}

              {orderQuery.data && !lockConflict && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-green-900">
                    Pedido{" "}
                    {orderQuery.data.order.customerOrderNumber ||
                      (orderQuery.data.order as any).orderNumber}
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    Cliente: {orderQuery.data.tenantName}
                  </p>
                  <p className="text-xs text-green-700">
                    {orderQuery.data.items.length} itens
                  </p>
                </div>
              )}

              {/* ── Alerta: pedido bloqueado por outro usuário ─────────── */}
              {lockConflict && (
                <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <Lock className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-bold text-amber-900 text-base">
                        Pedido em conferência
                      </p>
                      <p className="text-sm text-amber-800 mt-1">
                        Este pedido está sendo conferido por{" "}
                        <span className="font-semibold">{lockConflict.lockedByName}</span>
                        {lockConflict.minutesAgo > 0
                          ? ` (há ${lockConflict.minutesAgo} min)`
                          : " (agora mesmo)"}
                        .
                      </p>
                    </div>
                  </div>
                  <div className="bg-amber-100 rounded-lg p-3">
                    <p className="text-xs text-amber-800">
                      Aguarde o conferente finalizar ou peça ao administrador para liberar o pedido.
                      O lock é liberado automaticamente após 10 minutos de inatividade.
                    </p>
                  </div>
                </div>
              )}

              {orderQuery.error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-900">
                    {orderQuery.error.message}
                  </p>
                </div>
              )}

              <Button
                onClick={handleStartCheck}
                disabled={!orderQuery.data || startCheckMut.isPending}
                size="lg"
                className="w-full h-12"
              >
                {startCheckMut.isPending ? "Iniciando..." : "Iniciar Conferência"}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* ── Resumo do Pedido ───────────────────────────────────────── */}
            <Card className="bg-blue-50 border-blue-200">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      Pedido {orderNumber}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {scannedItems.length} item(ns) conferido(s)
                    </p>
                  </div>
                  {/* Botão de abandono com confirmação */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={requestAbandon}
                    className="text-red-600 border-red-300 hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4 mr-1" />
                    Abandonar
                  </Button>
                </div>
              </CardHeader>
            </Card>

            {/* ── ERRO DE LOTE — bloco visual bloqueante ─────────────────── */}
            {lotErrorData && (
              <div className="bg-red-50 border-2 border-red-500 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <XCircle className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold text-red-900 text-base">
                      Lote incorreto — leitura rejeitada
                    </p>
                    <p className="text-sm text-red-700 mt-1">
                      {lotErrorData.message}
                    </p>
                  </div>
                </div>
                <div className="bg-red-100 rounded-lg p-3 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-700 flex-shrink-0" />
                  <p className="text-sm font-medium text-red-800">
                    Bipe a etiqueta com o lote correto para continuar. O saldo
                    não foi alterado.
                  </p>
                </div>
              </div>
            )}

            {/* ── Card de Bipagem ────────────────────────────────────────── */}
            <Card
              className={
                lotErrorData ? "border-red-300 ring-2 ring-red-200" : ""
              }
            >
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  Bipar Etiqueta
                  {lotErrorData && (
                    <Badge variant="destructive" className="text-xs">
                      Lote inválido
                    </Badge>
                  )}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {lotErrorData
                    ? "Bipe a etiqueta correta (com o lote esperado)"
                    : "Bipe ou digite o código da etiqueta do produto"}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    ref={productInputRef}
                    placeholder="Código da etiqueta"
                    value={manualLabelCode}
                    onChange={(e) => setManualLabelCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && manualLabelCode.trim()) {
                        submitProductCode(manualLabelCode.trim());
                        setManualLabelCode("");
                      }
                    }}
                    className={`h-12 text-lg ${
                      lotErrorData
                        ? "border-red-400 focus:ring-red-300"
                        : ""
                    }`}
                    disabled={recordItemMut.isPending}
                    autoComplete="off"
                  />
                  <Button
                    size="lg"
                    onClick={() => {
                      if (manualLabelCode.trim()) {
                        submitProductCode(manualLabelCode.trim());
                        setManualLabelCode("");
                      } else {
                        toast.error("Digite o código da etiqueta");
                      }
                    }}
                    className="h-12 px-6"
                    disabled={
                      recordItemMut.isPending || !manualLabelCode.trim()
                    }
                  >
                    {recordItemMut.isPending ? (
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Scan className="h-5 w-5" />
                    )}
                  </Button>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">
                      ou
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  onClick={() => {
                    setCurrentField("product");
                    setShowScanner(true);
                  }}
                  className="w-full h-12"
                  disabled={recordItemMut.isPending}
                >
                  <Camera className="mr-2 h-5 w-5" />
                  Escanear com Câmera
                </Button>
              </CardContent>
            </Card>

            {/* ── Itens Conferidos ───────────────────────────────────────── */}
            {scannedItems.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Itens Conferidos</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {scannedItems.map((item, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {item.productCode}
                          </p>
                          <p className="text-xs text-gray-600 truncate">
                            {item.productName}
                          </p>
                          {item.batch && (
                            <p className="text-xs text-blue-600 mt-0.5">
                              Lote: {item.batch}
                            </p>
                          )}
                        </div>
                        <div className="text-right ml-2 flex-shrink-0">
                          <p className="font-bold text-green-600">
                            +{item.quantity}
                          </p>
                          <p className="text-xs text-gray-500">
                            Total: {item.checkedQuantity}
                            {item.remainingQuantity > 0 && (
                              <span className="text-amber-600">
                                {" "}
                                (falta: {item.remainingQuantity})
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Desfazer + Finalizar */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="lg"
                className="flex-1 h-14"
                onClick={handleUndo}
                disabled={undoStack.length === 0 || undoMut.isPending}
                title={undoStack.length === 0 ? "Nenhuma bipagem para desfazer" : `Desfazer: ${undoStack[undoStack.length - 1]?.productName}`}
              >
                <Undo2 className="h-5 w-5 mr-2" />
                Desfazer{undoStack.length > 0 ? ` (${undoStack.length})` : ""}
              </Button>
              <Button
                onClick={handleCompleteCheck}
                disabled={
                  completeCheckMut.isPending || scannedItems.length === 0
                }
                size="lg"
                className="flex-1 h-14 bg-green-600 hover:bg-green-700"
              >
                {completeCheckMut.isPending
                  ? "Finalizando..."
                  : "Finalizar Conferência"}
              </Button>
            </div>
          </>
        )}
      </div>

      {/* ── Modal: Abandono de Conferência ────────────────────────────────── */}
      <Dialog open={showAbandonModal} onOpenChange={setShowAbandonModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <LogOut className="h-5 w-5" />
              Abandonar Conferência?
            </DialogTitle>
            <DialogDescription>
              Você tem uma conferência em andamento para o pedido{" "}
              <span className="font-semibold">{orderNumber}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800">
                Ao abandonar, o pedido será{" "}
                <span className="font-semibold">liberado para outros conferentes</span>.
                O progresso da conferência será mantido e poderá ser retomado.
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Deseja realmente abandonar a conferência?
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowAbandonModal(false)}
            >
              Continuar Conferindo
            </Button>
            <Button
              variant="destructive"
              onClick={handleAbandonConference}
              disabled={releaseLockMut.isPending}
            >
              {releaseLockMut.isPending ? "Liberando..." : "Abandonar e Liberar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Item Fracionado ─────────────────────────────────────────── */}
      <Dialog open={showFractionalModal} onOpenChange={setShowFractionalModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Item Fracionado Detectado</DialogTitle>
            <DialogDescription>
              A quantidade restante é menor que 1 caixa. Informe a quantidade
              exata conferida.
            </DialogDescription>
          </DialogHeader>
          {fractionalData && (
            <div className="space-y-4 py-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm font-medium text-yellow-900">
                  {fractionalData.productName}
                </p>
                <p className="text-xs text-yellow-700 mt-1">
                  SKU: {fractionalData.productSku}
                  {fractionalData.batch && ` | Lote: ${fractionalData.batch}`}
                </p>
                <p className="text-xs text-yellow-700">
                  Quantidade restante:{" "}
                  <span className="font-bold">
                    {fractionalData.remainingQuantity}
                  </span>{" "}
                  unidades
                </p>
                <p className="text-xs text-yellow-700">
                  (1 caixa = {fractionalData.unitsPerBox} unidades)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fractionalQuantity">
                  Quantidade Conferida (unidades)
                </Label>
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
            <Button
              variant="outline"
              onClick={() => {
                setShowFractionalModal(false);
                setFractionalData(null);
                setFractionalQuantity("");
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleRecordFractional}
              disabled={recordItemMut.isPending}
            >
              {recordItemMut.isPending ? "Registrando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Etiquetas de Volume ─────────────────────────────────────── */}
      <Dialog open={showVolumeModal} onOpenChange={setShowVolumeModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar Etiquetas de Volume</DialogTitle>
            <DialogDescription>
              Informe a quantidade de volumes para gerar as etiquetas de
              identificação
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="volumeQuantity">Quantidade de Volumes</Label>
              <Input
                id="volumeQuantity"
                type="number"
                placeholder="Ex: 3"
                value={volumeQuantity}
                onChange={(e) => setVolumeQuantity(e.target.value)}
                min="1"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleNewOrder}>
              Pular
            </Button>
            <Button
              onClick={handleGenerateLabels}
              disabled={generateLabelsMut.isPending}
            >
              {generateLabelsMut.isPending ? "Gerando..." : "Gerar Etiquetas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CollectorLayout>
  );
}
