/**
 * CollectorPicking — Fluxo guiado de picking com validação de lote
 *
 * Implementa a spec "Parte 1 — /collector/picking: Fluxo guiado por endereço".
 * Backend: collectorPickingRouter (server/collectorPickingRouter.ts)
 *
 * Fluxo de telas:
 *  select_order → scan_location → scan_product → fractional_input?
 *                                              → report_problem?
 *              → location_done → [próximo endereço | all_done]
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { CollectorLayout } from "../../components/CollectorLayout";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { BarcodeScanner } from "../../components/BarcodeScanner";
import { SyncStatusBadge } from "../../components/SyncStatusIndicator";
import { trpc } from "../../lib/trpc";
import { toast } from "sonner";
import { offlineQueue, QueuedOperation } from "../../lib/offlineQueue";
import {
  MapPin,
  Package,
  CheckCircle2,
  AlertTriangle,
  PauseCircle,
  Camera,
  ChevronRight,
  RotateCcw,
  Scale,
  Scan,
  ArrowLeft,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen =
  | "select_order"
  | "resume_summary"
  | "scan_location"
  | "scan_product"
  | "fractional_input"
  | "report_problem"
  | "location_done"
  | "all_done";

interface RouteItem {
  allocationId: number;
  pickingOrderId: number; // ✅ Adicionar pickingOrderId
  productId: number;
  productSku: string;
  productName: string;
  batch: string | null;
  expiryDate: string | null;
  quantity: number;
  pickedQuantity: number;
  isFractional: boolean;
  status: string;
}

interface RouteLocation {
  locationId: number;
  locationCode: string;
  sequence: number;
  hasFractional: boolean;
  allDone: boolean;
  items: RouteItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function totalItems(route: RouteLocation[]) {
  return route.reduce((s, loc) => s + loc.items.length, 0);
}

function completedItems(route: RouteLocation[]) {
  return route.reduce(
    (s, loc) =>
      s +
      loc.items.filter(
        (i) => i.status === "picked" || i.status === "short_picked"
      ).length,
    0
  );
}

function pct(a: number, b: number) {
  if (b === 0) return 0;
  return Math.round((a / b) * 100);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div
        className="bg-blue-600 h-2 rounded-full transition-all duration-500"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function StatusHeader({
  orderNumber,
  locationIndex,
  totalLocations,
  done,
  total,
}: {
  orderNumber: string;
  locationIndex: number;
  totalLocations: number;
  done: number;
  total: number;
}) {
  const progress = pct(done, total);
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
            Pedido
          </p>
          <p className="font-bold text-gray-900">{orderNumber}</p>
        </div>
        <Badge
          variant="outline"
          className="text-blue-700 border-blue-300 bg-blue-50"
        >
          Endereço {locationIndex + 1} / {totalLocations}
        </Badge>
      </div>
      <div className="space-y-1">
        <ProgressBar value={progress} />
        <p className="text-xs text-gray-500 text-right">
          {done} / {total} itens — {progress}% concluído
        </p>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function CollectorPicking() {
  const [screen, setScreen] = useState<Screen>("select_order");
  const [showScanner, setShowScanner] = useState(false);

  // Order state
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [orderInfo, setOrderInfo] = useState<{
    id: number;
    waveNumber: string;
    status: string;
    totalOrders: number;
    totalItems: number;
  } | null>(null);

  // Route state
  const [route, setRoute] = useState<RouteLocation[]>([]);
  const [locationIdx, setLocationIdx] = useState(0);
  const [isResume, setIsResume] = useState(false);

  // Scan inputs
  const [locationScanInput, setLocationScanInput] = useState("");
  const [currentItemIdx, setCurrentItemIdx] = useState(0);
  const [productScanInput, setProductScanInput] = useState("");

  // Fractional
  const [fractionalMax, setFractionalMax] = useState(0);
  const [fractionalInput, setFractionalInput] = useState("");
  const [pendingAllocationId, setPendingAllocationId] = useState<number | null>(
    null
  );

  // Report problem
  const [reportTarget, setReportTarget] = useState<"location" | "product">(
    "product"
  );
  const [reportReason, setReportReason] = useState("");
  const [insufficientQtyInput, setInsufQtyInput] = useState("");

  // Pilha LIFO para desfazer bipagens no picking
  const [undoStack, setUndoStack] = useState<Array<{
    allocationId: number;
    pickingOrderId: number;
    quantityAdded: number;
    productName: string;
  }>>([]);

  const locationInputRef = useRef<HTMLInputElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);
  const fractionalInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  // ── Derived ────────────────────────────────────────────────────────────────
  const currentLocation: RouteLocation | undefined = route[locationIdx];
  const pendingItems =
    currentLocation?.items.filter(
      (i) => i.status !== "picked" && i.status !== "short_picked"
    ) ?? [];
  const currentItem: RouteItem | undefined = pendingItems[currentItemIdx];

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: orders, isLoading: ordersLoading } =
    trpc.collectorPicking.listOrders.useQuery(
      {},
      { enabled: screen === "select_order" }
    );

  // ── Mutations ──────────────────────────────────────────────────────────────
  const startOrResumeMut = trpc.collectorPicking.startOrResume.useMutation({
    onSuccess: (data) => {
      setOrderInfo(data.wave as any);
      setRoute(data.route as RouteLocation[]);
      setIsResume(data.isResume);

      const savedSeq = data.progress.currentSequence;
      const idx = (data.route as RouteLocation[]).findIndex(
        (loc) => loc.sequence >= savedSeq
      );
      setLocationIdx(Math.max(0, idx));
      setCurrentItemIdx(0);

      if (data.isResume && (data.progress.scannedItems as any[]).length > 0) {
        setScreen("resume_summary");
      } else {
        setScreen("scan_location");
        setTimeout(() => locationInputRef.current?.focus(), 200);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const confirmLocationMut = trpc.collectorPicking.confirmLocation.useMutation({
    onSuccess: () => {
      setLocationScanInput("");
      setCurrentItemIdx(0);
      setScreen("scan_product");
      setTimeout(() => productInputRef.current?.focus(), 200);
    },
    onError: (err) => {
      toast.error(err.message, { duration: 4000 });
      setLocationScanInput("");
      setTimeout(() => locationInputRef.current?.focus(), 100);
    },
  });

  // Configurar função de sincronização offline
  const trpcUtils = trpc.useUtils();
  useEffect(() => {
    offlineQueue.setSyncFunction(async (operation: QueuedOperation) => {
      if (operation.operationType === 'scanProduct') {
        try {
          await trpcUtils.client.collectorPicking.scanProduct.mutate(operation.payload);
          return true;
        } catch (error) {
          console.error('[OfflineSync] Error syncing scanProduct:', error);
          return false;
        }
      }
      return false;
    });
  }, [trpcUtils]);

  const scanProductMut = trpc.collectorPicking.scanProduct.useMutation({
    onSuccess: (data) => {
      setProductScanInput("");

      if (data.requiresManualQuantity) {
        setPendingAllocationId(currentItem?.allocationId ?? null);
        setFractionalMax(data.maxQuantity ?? 0);
        setFractionalInput("");
        setScreen("fractional_input");
        setTimeout(() => fractionalInputRef.current?.focus(), 200);
        return;
      }

      toast.success(data.message);

      // Empilhar bipagem na pilha LIFO
      if (currentItem) {
        setUndoStack(prev => [...prev, {
          allocationId: currentItem.allocationId,
          pickingOrderId: currentItem.pickingOrderId,
          quantityAdded: data.quantityAdded ?? 1,
          productName: currentItem.productName,
        }]);
      }
      
      // Atualizar rota e executar lógica após dados estarem atualizados
      refreshRoute((updatedRoute) => {
        if (data.allocationCompleted) {
          advanceItem(updatedRoute);
        } else {
          productInputRef.current?.focus();
        }
      });    },
    onError: async (err) => {
      // Se falhar, adicionar à fila offline
      if (!navigator.onLine) {
        const operationId = await offlineQueue.enqueue('scanProduct', {
          pickingOrderId: currentItem!.pickingOrderId, // ✅ Usar pickingOrderId do item
          allocationId: currentItem!.allocationId,
          scannedCode: productScanInput,
        });
        toast.warning('Offline: Operação salva localmente', { duration: 3000 });
        setProductScanInput("");
        // Simular sucesso localmente para continuar fluxo
        refreshRoute();
        setTimeout(() => productInputRef.current?.focus(), 100);
      } else {
        toast.error(err.message, { duration: 5000 });
        setProductScanInput("");
        setTimeout(() => productInputRef.current?.focus(), 100);
      }
    },
  });

  const recordFractionalMut =
    trpc.collectorPicking.recordFractionalQuantity.useMutation({
      onSuccess: (data) => {
        toast.success(`+${data.quantityAdded} registrado.`);
        // Empilhar bipagem fracionada na pilha LIFO
        if (pendingAllocationId !== null && currentItem) {
          setUndoStack(prev => [...prev, {
            allocationId: pendingAllocationId,
            pickingOrderId: currentItem.pickingOrderId,
            quantityAdded: data.quantityAdded,
            productName: currentItem.productName,
          }]);
        }
        setFractionalInput("");
        setPendingAllocationId(null);
        setScreen("scan_product");
        
        refreshRoute((updatedRoute) => {
          if (data.allocationCompleted) {
            advanceItem(updatedRoute);
          } else {
            setTimeout(() => productInputRef.current?.focus(), 100);
          }
        });
      },
      onError: (err) => toast.error(err.message),
    });

  const reportLocationMut =
    trpc.collectorPicking.reportLocationProblem.useMutation({
      onSuccess: (data) => {
        toast.warning(data.message);
        refreshRoute();
        advanceLocation();
      },
      onError: (err) => toast.error(err.message),
    });

  const reportProductMut =
    trpc.collectorPicking.reportProductProblem.useMutation({
      onSuccess: (data) => {
        if (data.alternativeFound) {
          toast.info(`Endereço alternativo: ${data.alternativeLocation}`);
        } else {
          toast.warning(data.message);
        }
        setScreen("scan_product");
        
        refreshRoute((updatedRoute) => {
          advanceItem(updatedRoute);
        });
      },
      onError: (err) => toast.error(err.message),
    });

  const undoMut = trpc.collectorPicking.undoLastScan.useMutation({
    onSuccess: (data) => {
      setUndoStack(prev => prev.slice(0, -1));
      toast.info(data.message);
      refreshRoute();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleUndo = () => {
    if (undoStack.length === 0) {
      toast.error("Nenhuma bipagem para desfazer");
      return;
    }
    const top = undoStack[undoStack.length - 1];
    undoMut.mutate({
      allocationId: top.allocationId,
      pickingOrderId: top.pickingOrderId,
      quantityToUndo: top.quantityAdded,
    });
  };

  const pauseMut = trpc.collectorPicking.pause.useMutation({
    onSuccess: () => {
      toast.success("Progresso salvo. Retome quando quiser.");
      utils.collectorPicking.listOrders.invalidate();
      resetAll();
    },
    onError: (err) => toast.error(err.message),
  });

  const completeMut = trpc.collectorPicking.complete.useMutation({
    onSuccess: (data) => {
      if (data.hasDivergences) {
        toast.warning(data.message, { duration: 6000 });
      } else {
        toast.success(data.message);
      }
      utils.collectorPicking.listOrders.invalidate();
      setScreen("all_done");
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  function refreshRoute(onComplete?: (updatedRoute: RouteLocation[]) => void) {
    if (!selectedOrderId) return;
    utils.collectorPicking.getRoute
      .fetch({ pickingOrderId: selectedOrderId })
      .then((r) => {
        const updatedRoute = r as RouteLocation[];
        setRoute(updatedRoute);
        // Executar callback IMEDIATAMENTE com dados atualizados
        if (onComplete) {
          setTimeout(() => onComplete(updatedRoute), 50); // Delay para React processar, mas passa dados diretos
        }
      });
  }

  function advanceItem(updatedRoute?: RouteLocation[]) {
    // IMPORTANTE: Esta função recebe dados ATUALIZADOS diretamente do refreshRoute(),
    // evitando dependência de estado que pode estar desatualizado
    
    const routeToUse = updatedRoute ?? route;
    const currentLoc = routeToUse[locationIdx];
    
    if (!currentLoc) {
      console.warn("[advanceItem] currentLocation é undefined");
      setScreen("location_done");
      return;
    }
    
    // Buscar se ainda existe algum item não coletado neste endereço
    // IMPORTANTE: Incluir "in_progress" pois item pode estar parcialmente bipado
    const pendingItems = currentLoc.items.filter(
      (i) => i.status !== "picked" && i.status !== "short_picked"
    );
    
    const nextPendingItem = pendingItems.length > 0 ? pendingItems[0] : null;
    
    if (nextPendingItem) {
      // ✅ Ainda há lotes aqui! Reseta para o primeiro disponível
      console.log(`[advanceItem] Item pendente encontrado, resetando índice para 0`);
      setCurrentItemIdx(0);
      setScreen("scan_product");
      setTimeout(() => productInputRef.current?.focus(), 100);
    } else {
      // ✅ Acabaram os lotes DESTE endereço.
      // Agora sim verificamos se vamos para o próximo endereço ou se acabou tudo.
      console.log("[advanceItem] Todos os itens do endereço foram separados");
      
      // Sempre vai para location_done — seja para avançar ao próximo endereço
      // ou para exibir o botão "Finalizar Pedido" (último endereço).
      // O completeMut é disparado pelo botão na tela location_done.
      setScreen("location_done");
    }
  }

  function advanceLocation() {
    const nextIdx = locationIdx + 1;
    if (nextIdx < route.length) {
      setLocationIdx(nextIdx);
      setCurrentItemIdx(0);
      setScreen("scan_location");
      setTimeout(() => locationInputRef.current?.focus(), 200);
    } else {
      setScreen("all_done");
    }
  }

  function resetAll() {
    setScreen("select_order");
    setSelectedOrderId(null);
    setOrderInfo(null);
    setRoute([]);
    setLocationIdx(0);
    setCurrentItemIdx(0);
    setLocationScanInput("");
    setProductScanInput("");
    setFractionalInput("");
    setPendingAllocationId(null);
    setIsResume(false);
  }

  function handlePause() {
    if (!selectedOrderId || !orderInfo) return;
    pauseMut.mutate({
      pickingOrderId: selectedOrderId,
      currentSequence: currentLocation?.sequence ?? 1,
      currentLocationId: currentLocation?.locationId ?? null,
      scannedItems: [],
    });
  }

  function handleComplete() {
    if (!selectedOrderId) return;
    completeMut.mutate({ pickingOrderId: selectedOrderId });
  }

  function handleFractionalConfirm() {
    const qty = parseInt(fractionalInput);
    if (!qty || qty <= 0 || qty > fractionalMax) {
      toast.error(`Informe uma quantidade entre 1 e ${fractionalMax}`);
      return;
    }
    if (!selectedOrderId || !pendingAllocationId) return;
    recordFractionalMut.mutate({
      pickingOrderId: selectedOrderId,
      allocationId: pendingAllocationId,
      quantity: qty,
    });
  }

  // Scanner
  const handleScan = useCallback(
    (code: string) => {
      setShowScanner(false);
      if (screen === "scan_location") {
        setLocationScanInput(code);
        if (!selectedOrderId || !currentLocation) return;
        confirmLocationMut.mutate({
          pickingOrderId: selectedOrderId,
          expectedLocationCode: currentLocation.locationCode,
          scannedLocationCode: code,
        });
      } else if (screen === "scan_product") {
        setProductScanInput(code);
        if (!selectedOrderId || !currentItem) return;
        
        // Validação tripla: currentItem existe e tem allocationId válido
        if (!currentItem.allocationId) {
          toast.error("Erro: ID de alocação inválido. Atualizando rota...");
          refreshRoute();
          return;
        }
        
        scanProductMut.mutate({
          pickingOrderId: currentItem.pickingOrderId, // ✅ Usar pickingOrderId do item
          allocationId: currentItem.allocationId,
          scannedCode: code,
        });
      }
    },
    [screen, selectedOrderId, currentLocation, currentItem]
  );

  // ── Scanner overlay ────────────────────────────────────────────────────────
  if (showScanner) {
    return (
      <BarcodeScanner
        onScan={handleScan}
        onClose={() => setShowScanner(false)}
      />
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN: SELECT ORDER
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === "select_order") {
    return (
      <CollectorLayout title="Picking — Separação">
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm font-medium text-blue-900">
              Selecione um pedido para iniciar ou retomar a separação.
            </p>
          </div>

          {ordersLoading && (
            <div className="text-center py-8 text-gray-400">
              <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-sm">Carregando pedidos...</p>
            </div>
          )}

          {!ordersLoading && (!orders || orders.length === 0) && (
            <div className="text-center py-12 text-gray-400">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">Nenhum pedido disponível</p>
              <p className="text-xs mt-1">
                Pedidos pendentes ou em progresso aparecerão aqui
              </p>
            </div>
          )}

          <div className="space-y-3">
            {orders?.map((order) => (
              <button
                key={order.id}
                className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-400 hover:bg-blue-50 transition-all active:scale-[0.98] shadow-sm"
                onClick={() => {
                  setSelectedOrderId(order.id);
                  startOrResumeMut.mutate({ waveId: order.id });
                }}
                disabled={startOrResumeMut.isPending}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900">
                        Onda {order.waveNumber}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {order.totalOrders} pedidos · {order.totalItems} itens
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                </div>
              </button>
            ))}
          </div>

          {startOrResumeMut.isPending && (
            <div className="text-center py-4">
              <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
              <p className="text-sm text-gray-500">Carregando rota...</p>
            </div>
          )}
        </div>
      </CollectorLayout>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN: RESUME SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === "resume_summary") {
    const done = completedItems(route);
    const total = totalItems(route);
    return (
      <CollectorLayout title="Retomando Separação">
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <RotateCcw className="h-6 w-6 text-amber-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-amber-900">
                  Retomando: Onda {orderInfo?.waveNumber}
                </p>
                <p className="text-sm text-amber-700 mt-0.5">
                  {done} de {total} itens já foram separados
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
            <ProgressBar value={pct(done, total)} />
            <p className="text-xs text-gray-500 text-center">
              {pct(done, total)}% concluído
            </p>
          </div>

          <p className="text-sm text-gray-600 text-center">
            Continuando no endereço{" "}
            <span className="font-bold text-gray-900">
              {currentLocation?.locationCode}
            </span>
          </p>

          <Button
            size="lg"
            className="w-full h-14 text-base font-semibold"
            onClick={() => {
              setScreen("scan_location");
              setTimeout(() => locationInputRef.current?.focus(), 200);
            }}
          >
            Continuar Separação
          </Button>

          <Button variant="ghost" className="w-full" onClick={resetAll}>
            Cancelar
          </Button>
        </div>
      </CollectorLayout>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN: SCAN LOCATION
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === "scan_location") {
    const done = completedItems(route);
    const total = totalItems(route);
    return (
      <CollectorLayout title="Bipar Endereço">
        <div className="space-y-4">
          <StatusHeader
            orderNumber={orderInfo?.waveNumber ?? ""}
            locationIndex={locationIdx}
            totalLocations={route.length}
            done={done}
            total={total}
          />

          {/* Destination */}
          <div className="bg-white border-2 border-blue-500 rounded-xl p-5 text-center shadow-sm">
            <MapPin className="h-10 w-10 text-blue-600 mx-auto mb-2" />
            <p className="text-sm text-gray-500 font-medium">Dirija-se ao endereço</p>
            <p className="text-3xl font-black text-gray-900 mt-1 tracking-tight">
              {currentLocation?.locationCode}
            </p>
            <div className="mt-2 flex items-center justify-center gap-3 text-sm text-gray-400">
              <span>{currentLocation?.items.length} item(ns)</span>
              {currentLocation?.hasFractional && (
                <>
                  <span>·</span>
                  <span className="text-amber-600 font-medium">
                    ⚠ item fracionado
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Items preview */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
              Itens a separar
            </p>
            {currentLocation?.items.map((item) => (
              <div
                key={item.allocationId}
                className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                  item.status === "picked"
                    ? "bg-green-50"
                    : item.status === "short_picked"
                    ? "bg-red-50"
                    : "bg-white border border-gray-100"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {item.productName}
                  </p>
                  <p className="text-xs text-gray-400">
                    {item.productSku}
                    {item.batch && ` · Lote: ${item.batch}`}
                  </p>
                </div>
                <div className="text-right ml-2 flex-shrink-0 flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-700">
                    {item.pickedQuantity}/{item.quantity}
                  </span>
                  {item.status === "picked" && (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  )}
                </div>
              </div>
            ))}
          </div>

          {currentLocation?.hasFractional && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
              <Scale className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-800">
                <span className="font-semibold">Atenção:</span> item
                fracionado. Tenha o instrumento de medição em mãos.
              </p>
            </div>
          )}

          {/* Scan */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">
              Bipe a etiqueta do endereço para confirmar:
            </p>
            <div className="flex gap-2">
              <Input
                ref={locationInputRef}
                value={locationScanInput}
                onChange={(e) => setLocationScanInput(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    locationScanInput.trim() &&
                    selectedOrderId &&
                    currentLocation
                  ) {
                    confirmLocationMut.mutate({
                      pickingOrderId: selectedOrderId,
                      expectedLocationCode: currentLocation.locationCode,
                      scannedLocationCode: locationScanInput.trim(),
                    });
                  }
                }}
                placeholder="Código do endereço"
                className="font-mono h-12 text-lg"
                autoComplete="off"
                disabled={confirmLocationMut.isPending}
              />
              <Button
                size="lg"
                variant="outline"
                className="h-12 px-4 flex-shrink-0"
                onClick={() => setShowScanner(true)}
              >
                <Camera className="h-5 w-5" />
              </Button>
              <Button
                size="lg"
                className="h-12 px-4 flex-shrink-0"
                disabled={
                  !locationScanInput.trim() || confirmLocationMut.isPending
                }
                onClick={() => {
                  if (!selectedOrderId || !currentLocation) return;
                  confirmLocationMut.mutate({
                    pickingOrderId: selectedOrderId,
                    expectedLocationCode: currentLocation.locationCode,
                    scannedLocationCode: locationScanInput.trim(),
                  });
                }}
              >
                {confirmLocationMut.isPending ? (
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Scan className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button
              variant="outline"
              className="flex-1 text-red-700 border-red-400 bg-red-50 hover:bg-red-100 font-semibold"
              onClick={() => {
                setReportTarget("location");
                setReportReason("");
                setScreen("report_problem");
              }}
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Reportar Problema
            </Button>
            <Button
              variant="ghost"
              className="flex-1"
              onClick={handlePause}
              disabled={pauseMut.isPending}
            >
              <PauseCircle className="h-4 w-4 mr-2" />
              Pausar
            </Button>
          </div>
        </div>
      </CollectorLayout>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN: SCAN PRODUCT
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === "scan_product") {
    if (!currentItem) {
      // Todos os itens concluídos — ir para tela de conclusão do endereço
      return (
        <CollectorLayout title="Endereço Concluído">
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center">
              <CheckCircle2 className="h-14 w-14 text-green-600 mx-auto mb-3" />
              <p className="text-xl font-bold text-green-900">Endereço concluído!</p>
            </div>
            <Button
              size="lg"
              className="w-full h-14 font-semibold"
              onClick={() => setScreen("location_done")}
            >
              Continuar
            </Button>
          </div>
        </CollectorLayout>
      );
    }

    const done = completedItems(route);
    const total = totalItems(route);
    const remaining = currentItem.quantity - currentItem.pickedQuantity;

    return (
      <CollectorLayout title="Bipar Produto">
        <div className="space-y-4">
          <StatusHeader
            orderNumber={orderInfo?.waveNumber ?? ""}
            locationIndex={locationIdx}
            totalLocations={route.length}
            done={done}
            total={total}
          />

          {/* Current item */}
          <div className="bg-white border-2 border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-start gap-3">
              <Package className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 leading-tight">
                  {currentItem.productName}
                </p>
                <p className="text-sm text-gray-700 font-medium mt-0.5">
                  {currentItem.productSku}
                </p>
                {currentItem.batch && (
                  <span className="mt-1.5 inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 border border-blue-200">
                    Lote: {currentItem.batch}
                  </span>
                )}
              </div>
            </div>

            {/* Quantity */}
            <div className="bg-slate-100 rounded-lg p-3 grid grid-cols-3 divide-x divide-slate-300">
              <div className="text-center px-2">
                <p className="text-xs text-gray-700 font-semibold uppercase tracking-wide">
                  Esperado
                </p>
                <p className="text-2xl font-black text-gray-900">
                  {currentItem.quantity}
                </p>
              </div>
              <div className="text-center px-2">
                <p className="text-xs text-gray-700 font-semibold uppercase tracking-wide">
                  Separado
                </p>
                <p className="text-2xl font-black text-green-600">
                  {currentItem.pickedQuantity}
                </p>
              </div>
              <div className="text-center px-2">
                <p className="text-xs text-gray-700 font-semibold uppercase tracking-wide">
                  Restante
                </p>
                <p className="text-2xl font-black text-blue-700">{remaining}</p>
              </div>
            </div>

            {currentItem.isFractional && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
                <Scale className="h-4 w-4 flex-shrink-0" />
                Item fracionado — quantidade manual será solicitada
              </div>
            )}
          </div>

          {/* Other pending items */}
          {pendingItems.length > 1 && (
            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2 px-1">
                Próximos itens neste endereço
              </p>
              {pendingItems.slice(1, 4).map((it) => (
                <div
                  key={it.allocationId}
                  className="flex items-center justify-between px-2 py-1.5 text-sm text-gray-700"
                >
                  <span className="truncate">{it.productName}</span>
                  <span className="ml-2 font-semibold flex-shrink-0">
                    {it.pickedQuantity}/{it.quantity}
                  </span>
                </div>
              ))}
              {pendingItems.length > 4 && (
                <p className="text-xs text-gray-600 px-2 pt-1">
                  +{pendingItems.length - 4} mais...
                </p>
              )}
            </div>
          )}

          {/* Scan */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-800">
              Bipe a etiqueta do produto:
            </p>
            <div className="flex gap-2">
              <Input
                ref={productInputRef}
                value={productScanInput}
                onChange={(e) => setProductScanInput(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    productScanInput.trim() &&
                    selectedOrderId &&
                    currentItem
                  ) {
                    // Validação de allocationId antes de enviar
                    if (!currentItem.allocationId) {
                      toast.error("Erro: ID de alocação inválido. Atualizando rota...");
                      refreshRoute();
                      return;
                    }
                    
                    scanProductMut.mutate({
                      pickingOrderId: currentItem.pickingOrderId, // ✅ Usar pickingOrderId do item
                      allocationId: currentItem.allocationId,
                      scannedCode: productScanInput.trim(),
                    });
                  }
                }}
                placeholder="Código / etiqueta do produto"
                className="font-mono h-12 text-base border-2 border-slate-400 focus:border-blue-500 bg-white text-gray-900 placeholder:text-gray-500"
                autoComplete="off"
                disabled={scanProductMut.isPending}
              />
              <Button
                size="lg"
                variant="outline"
                className="h-12 px-4 flex-shrink-0"
                onClick={() => setShowScanner(true)}
              >
                <Camera className="h-5 w-5" />
              </Button>
              <Button
                size="lg"
                className="h-12 px-4 flex-shrink-0"
                disabled={
                  !productScanInput.trim() || scanProductMut.isPending
                }
                onClick={() => {
                  if (!selectedOrderId || !currentItem) return;
                  
                  // Validação de allocationId antes de enviar
                  if (!currentItem.allocationId) {
                    toast.error("Erro: ID de alocação inválido. Atualizando rota...");
                    refreshRoute();
                    return;
                  }
                  
                  scanProductMut.mutate({
                    pickingOrderId: currentItem.pickingOrderId, // ✅ Usar pickingOrderId do item
                    allocationId: currentItem.allocationId,
                    scannedCode: productScanInput.trim(),
                  });
                }}
              >
                {scanProductMut.isPending ? (
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Scan className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button
              variant="outline"
              className="flex-1 text-red-700 border-red-400 bg-red-50 hover:bg-red-100 font-semibold"
              onClick={() => {
                setReportTarget("product");
                setReportReason("");
                setInsufQtyInput("");
                setScreen("report_problem");
              }}
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Reportar Falta/Avaria
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleUndo}
              disabled={undoStack.length === 0 || undoMut.isPending}
              title={undoStack.length === 0 ? "Nenhuma bipagem para desfazer" : `Desfazer: ${undoStack[undoStack.length - 1]?.productName}`}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Desfazer
            </Button>
            <Button
              variant="ghost"
              className="flex-1"
              onClick={handlePause}
              disabled={pauseMut.isPending}
            >
              <PauseCircle className="h-4 w-4 mr-2" />
              Pausar
            </Button>
          </div>
        </div>
      </CollectorLayout>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN: FRACTIONAL INPUT
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === "fractional_input") {
    return (
      <CollectorLayout title="Quantidade Fracionada">
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <Scale className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900">Item fracionado</p>
              <p className="text-sm text-amber-700 mt-1">
                A quantidade restante é menor que 1 caixa completa. Informe a
                quantidade exata separada.
              </p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-1">
            <p className="font-bold text-gray-900">{currentItem?.productName}</p>
            <p className="text-sm text-gray-500">{currentItem?.productSku}</p>
            {currentItem?.batch && (
              <p className="text-sm text-blue-700">Lote: {currentItem.batch}</p>
            )}
            <div className="pt-2 border-t border-gray-100 mt-2">
              <p className="text-sm text-gray-600">
                Máximo a separar:{" "}
                <span className="font-bold text-gray-900">{fractionalMax} un.</span>
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Quantidade separada (unidades)
            </label>
            <Input
              ref={fractionalInputRef}
              type="number"
              inputMode="numeric"
              min={1}
              max={fractionalMax}
              value={fractionalInput}
              onChange={(e) => setFractionalInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleFractionalConfirm();
              }}
              placeholder={`Máx: ${fractionalMax}`}
              className="h-14 text-2xl font-bold text-center"
            />
          </div>

          <Button
            size="lg"
            className="w-full h-14 text-base font-semibold"
            disabled={
              !fractionalInput ||
              parseInt(fractionalInput) <= 0 ||
              parseInt(fractionalInput) > fractionalMax ||
              recordFractionalMut.isPending
            }
            onClick={handleFractionalConfirm}
          >
            {recordFractionalMut.isPending
              ? "Registrando..."
              : "Confirmar Quantidade"}
          </Button>

          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              setScreen("scan_product");
              setFractionalInput("");
              setPendingAllocationId(null);
            }}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </div>
      </CollectorLayout>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN: REPORT PROBLEM
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === "report_problem") {
    const isLocation = reportTarget === "location";
    const locationReasons = [
      { value: "inaccessible", label: "Endereço inacessível" },
      { value: "damaged_label", label: "Etiqueta danificada" },
    ];
    const productReasons = [
      { value: "not_found", label: "Produto não encontrado" },
      { value: "damaged", label: "Produto avariado" },
      { value: "insufficient_quantity", label: "Quantidade insuficiente" },
    ];
    const reasons = isLocation ? locationReasons : productReasons;

    const handleSubmitReport = () => {
      if (!reportReason) {
        toast.error("Selecione o motivo");
        return;
      }
      if (!selectedOrderId) return;

      if (isLocation && currentLocation) {
        reportLocationMut.mutate({
          pickingOrderId: selectedOrderId,
          locationCode: currentLocation.locationCode,
          reason: reportReason as "inaccessible" | "damaged_label",
        });
      } else if (!isLocation && currentItem) {
        const availableQty =
          reportReason === "insufficient_quantity"
            ? parseInt(insufficientQtyInput) || 0
            : undefined;

        reportProductMut.mutate({
          pickingOrderId: selectedOrderId,
          allocationId: currentItem.allocationId,
          reason: reportReason as
            | "not_found"
            | "damaged"
            | "insufficient_quantity",
          availableQuantity: availableQty,
        });
      }
    }

    return (
      <CollectorLayout
        title={isLocation ? "Problema no Endereço" : "Reportar Falta/Avaria"}
      >
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">
                {isLocation
                  ? `Endereço: ${currentLocation?.locationCode}`
                  : `Produto: ${currentItem?.productName}`}
              </p>
              {!isLocation && currentItem?.batch && (
                <p className="text-sm text-red-700 mt-0.5">
                  Lote: {currentItem.batch}
                </p>
              )}
              <p className="text-sm text-red-700 mt-1">
                Selecione o motivo e confirme. O gerente será notificado.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-700">Motivo:</p>
            <div className="space-y-2">
              {reasons.map((r) => (
                <button
                  key={r.value}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                    reportReason === r.value
                      ? "border-red-500 bg-red-50 text-red-900"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                  }`}
                  onClick={() => setReportReason(r.value)}
                >
                  <span className="font-medium">{r.label}</span>
                </button>
              ))}
            </div>
          </div>

          {reportReason === "insufficient_quantity" && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Quantidade que conseguiu separar:
              </label>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={currentItem?.quantity}
                value={insufficientQtyInput}
                onChange={(e) => setInsufQtyInput(e.target.value)}
                placeholder="Ex: 5"
                className="h-12 text-lg"
              />
            </div>
          )}

          <Button
            size="lg"
            className="w-full h-14 bg-red-600 hover:bg-red-700 text-white font-semibold"
            disabled={
              !reportReason ||
              reportLocationMut.isPending ||
              reportProductMut.isPending
            }
            onClick={handleSubmitReport}
          >
            {reportLocationMut.isPending || reportProductMut.isPending
              ? "Registrando..."
              : "Confirmar Ocorrência"}
          </Button>

          <Button
            variant="ghost"
            className="w-full"
            onClick={() =>
              setScreen(isLocation ? "scan_location" : "scan_product")
            }
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Cancelar
          </Button>
        </div>
      </CollectorLayout>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN: LOCATION DONE
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === "location_done") {
    // Verificar se há itens pendentes em TODA a rota (não apenas no endereço atual)
    const hasPendingItems = route.some(location => 
      location.items.some(item => 
        item.status === "pending" || item.status === "in_progress"
      )
    );
    const isLast = !hasPendingItems;
    return (
      <CollectorLayout title="Endereço Concluído">
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center">
            <CheckCircle2 className="h-14 w-14 text-green-600 mx-auto mb-3" />
            <p className="text-xl font-bold text-green-900">
              Endereço concluído!
            </p>
            <p className="text-sm text-green-700 mt-1 font-medium">
              {currentLocation?.locationCode}
            </p>
          </div>

          {isLast ? (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                <p className="font-semibold text-blue-900">
                  Todos os endereços foram visitados!
                </p>
                <p className="text-sm text-blue-700 mt-1">
                  Confirme para finalizar o pedido.
                </p>
              </div>
              <Button
                size="lg"
                className="w-full h-14 text-base font-semibold bg-green-600 hover:bg-green-700"
                onClick={handleComplete}
                disabled={completeMut.isPending}
              >
                {completeMut.isPending
                  ? "Finalizando..."
                  : "Finalizar Pedido"}
              </Button>
            </>
          ) : (
            <>
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-sm text-gray-600">Próximo endereço:</p>
                <p className="text-2xl font-black text-gray-900 mt-1">
                  {route[locationIdx + 1]?.locationCode}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {route[locationIdx + 1]?.items.length} item(ns)
                  {route[locationIdx + 1]?.hasFractional && (
                    <span className="text-amber-600"> · ⚠ fracionado</span>
                  )}
                </p>
              </div>
              <Button
                size="lg"
                className="w-full h-14 text-base font-semibold"
                onClick={advanceLocation}
              >
                Ir para Próximo Endereço
                <ChevronRight className="h-5 w-5 ml-2" />
              </Button>
            </>
          )}

          <Button
            variant="ghost"
            className="w-full"
            onClick={handlePause}
            disabled={pauseMut.isPending}
          >
            <PauseCircle className="h-4 w-4 mr-2" />
            Pausar Separação
          </Button>
        </div>
      </CollectorLayout>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN: ALL DONE
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === "all_done") {
    return (
      <CollectorLayout title="Separação Finalizada">
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-3" />
            <p className="text-2xl font-black text-green-900">Concluído!</p>
            {orderInfo && (
              <p className="text-sm text-green-700 mt-2">
                Onda {orderInfo.waveNumber} finalizada.
              </p>
            )}
          </div>
          <Button
            size="lg"
            className="w-full h-14 font-semibold"
            onClick={resetAll}
          >
            Novo Pedido
          </Button>
        </div>
      </CollectorLayout>
    );
  }

  return null;
}
