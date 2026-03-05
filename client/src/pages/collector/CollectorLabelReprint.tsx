/**
 * CollectorLabelReprint — Reimpressão de Etiquetas no Coletor
 *
 * Menu principal com 5 tipos de etiqueta:
 *  1. Recebimento   – ordens de recebimento
 *  2. Separação     – ondas de picking
 *  3. Volumes       – expedições/romaneios
 *  4. Produtos      – etiquetas de itens (labelAssociations)
 *  5. Endereços     – posições de estoque
 *
 * Cada tipo abre uma sub-tela com campo de busca + lista + botão de reimpressão.
 */

import { useState, useCallback, useMemo } from "react";
import { CollectorLayout } from "../../components/CollectorLayout";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { trpc } from "../../lib/trpc";
import { toast } from "sonner";
import {
  ClipboardCheck,
  ScanLine,
  Truck,
  BarcodeIcon,
  MapPin,
  ChevronRight,
  ChevronLeft,
  Search,
  Printer,
  Loader2,
  CheckSquare,
  Square,
  CheckCheck,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LabelType = "receiving" | "waves" | "shipments" | "products" | "locations";

interface LabelTypeConfig {
  key: LabelType;
  title: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
}

const LABEL_TYPES: LabelTypeConfig[] = [
  {
    key: "receiving",
    title: "Etiquetas de Recebimento",
    description: "Reimprima etiquetas para ordens de recebimento",
    icon: ClipboardCheck,
    iconColor: "text-blue-600",
    iconBg: "bg-blue-50",
  },
  {
    key: "waves",
    title: "Etiquetas de Pedidos de Separação",
    description: "Reimprima etiquetas para ondas de picking",
    icon: ScanLine,
    iconColor: "text-green-600",
    iconBg: "bg-green-50",
  },
  {
    key: "shipments",
    title: "Etiquetas de Volumes",
    description: "Reimprima etiquetas de volumes específicos",
    icon: Truck,
    iconColor: "text-orange-600",
    iconBg: "bg-orange-50",
  },
  {
    key: "products",
    title: "Etiquetas de Produtos",
    description: "Reimprima etiquetas para itens individuais",
    icon: BarcodeIcon,
    iconColor: "text-indigo-600",
    iconBg: "bg-indigo-50",
  },
  {
    key: "locations",
    title: "Etiquetas de Endereços",
    description: "Reimprima etiquetas para posições de estoque",
    icon: MapPin,
    iconColor: "text-purple-600",
    iconBg: "bg-purple-50",
  },
];

// ---------------------------------------------------------------------------
// Sub-screen helpers
// ---------------------------------------------------------------------------

function openPdfInNewTab(dataUrl: string) {
  const win = window.open();
  if (win) {
    win.document.write(
      `<iframe src="${dataUrl}" style="width:100%;height:100%;border:none;"></iframe>`
    );
  } else {
    // fallback: download
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "etiqueta.pdf";
    a.click();
  }
}

// ---------------------------------------------------------------------------
// Sub-screens
// ---------------------------------------------------------------------------

function ReceivingSubScreen({ onBack }: { onBack: () => void }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const { data, isLoading } = trpc.labelReprint.listReceiving.useQuery(
    { search: query || undefined, limit: 30 },
    { enabled: true }
  );

  const reprint = trpc.labelReprint.reprintReceiving.useMutation({
    onSuccess: (result) => {
      toast.success("Etiqueta gerada!");
      openPdfInNewTab(result.pdf);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <SubScreenWrapper title="Etiquetas de Recebimento" onBack={onBack}>
      <SearchBar
        value={search}
        onChange={setSearch}
        onSearch={() => setQuery(search)}
        placeholder="OT, NF ou fornecedor..."
      />
      {isLoading && <LoadingRow />}
      {!isLoading && data?.length === 0 && <EmptyRow />}
      {data?.map((row) => (
        <ItemRow
          key={row.id}
          primary={row.orderNumber}
          secondary={row.supplierName ?? ""}
          badge={row.status}
          loading={reprint.isPending}
          onPrint={() => reprint.mutate({ receivingOrderId: row.id })}
        />
      ))}
    </SubScreenWrapper>
  );
}

function WavesSubScreen({ onBack }: { onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<"orders" | "waves">("orders");

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="text-slate-700">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Etiquetas de Separação</h2>
          <p className="text-sm text-slate-500">Reimprima etiquetas de pedidos ou ondas de picking</p>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        <button
          onClick={() => setActiveTab("orders")}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
            activeTab === "orders"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Pedidos
        </button>
        <button
          onClick={() => setActiveTab("waves")}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
            activeTab === "waves"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Ondas
        </button>
      </div>

      {/* Conteúdo da aba ativa */}
      {activeTab === "orders" ? <PickingOrdersTab /> : <WavesTab />}
    </div>
  );
}

function PickingOrdersTab() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const { data, isLoading } = trpc.labelReprint.listPickingOrders.useQuery(
    { search: query || undefined, limit: 50 },
    { enabled: true }
  );

  const reprint = trpc.labelReprint.reprintPickingOrder.useMutation({
    onSuccess: (result) => {
      toast.success("Etiqueta gerada!");
      openPdfInNewTab(result.pdf);
    },
    onError: (e) => toast.error(e.message),
  });

  const PRIORITY_LABELS: Record<string, string> = {
    emergency: "Emergência",
    urgent: "Urgente",
    normal: "Normal",
    low: "Baixa",
  };

  return (
    <div className="space-y-2">
      <SearchBar
        value={search}
        onChange={setSearch}
        onSearch={() => setQuery(search)}
        placeholder="Número do pedido ou cliente..."
      />
      {isLoading && <LoadingRow />}
      {!isLoading && (data?.length ?? 0) === 0 && <EmptyRow />}
      {data?.map((row) => (
        <ItemRow
          key={row.id}
          primary={row.customerOrderNumber ? `Nº ${row.customerOrderNumber}` : row.orderNumber}
          secondary={[
            row.customerOrderNumber ? `Cód. interno: ${row.orderNumber}` : null,
            row.customerName,
            `${row.totalItems ?? 0} itens`,
          ]
            .filter(Boolean)
            .join(" · ")}
          badge={PRIORITY_LABELS[row.priority] ?? row.priority}
          loading={reprint.isPending}
          onPrint={() => reprint.mutate({ pickingOrderId: row.id })}
        />
      ))}
    </div>
  );
}

function WavesTab() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const { data, isLoading } = trpc.labelReprint.listWaves.useQuery(
    { search: query || undefined, limit: 30 },
    { enabled: true }
  );

  const reprint = trpc.labelReprint.reprintWave.useMutation({
    onSuccess: (result) => {
      toast.success("Etiqueta gerada!");
      openPdfInNewTab(result.pdf);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-2">
      <SearchBar
        value={search}
        onChange={setSearch}
        onSearch={() => setQuery(search)}
        placeholder="Número da onda..."
      />
      {isLoading && <LoadingRow />}
      {!isLoading && (data?.length ?? 0) === 0 && <EmptyRow />}
      {data?.map((row) => (
        <ItemRow
          key={row.id}
          primary={row.waveNumber}
          secondary={`${row.totalOrders ?? 0} pedidos · ${row.totalItems ?? 0} itens`}
          badge={row.status}
          loading={reprint.isPending}
          onPrint={() => reprint.mutate({ waveId: row.id })}
        />
      ))}
    </div>
  );
}

function ShipmentsSubScreen({ onBack }: { onBack: () => void }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [volumeQty, setVolumeQty] = useState("1");

  const { data, isLoading } = trpc.labelReprint.listStageVolumes.useQuery(
    { search: query || undefined, limit: 30 },
    { enabled: true }
  );

  const reprint = trpc.labelReprint.reprintStageVolume.useMutation({
    onSuccess: (result) => {
      toast.success("Etiquetas geradas!");
      openPdfInNewTab(result.pdf);
      setSelectedId(null);
      setVolumeQty("1");
    },
    onError: (e) => toast.error(e.message),
  });

  function handlePrint(id: number) {
    const qty = parseInt(volumeQty);
    if (!qty || qty < 1) {
      toast.error("Informe uma quantidade válida de volumes");
      return;
    }
    reprint.mutate({ stageCheckId: id, totalVolumes: qty });
  }

  return (
    <SubScreenWrapper title="Etiquetas de Volumes" onBack={onBack}>
      <SearchBar
        value={search}
        onChange={setSearch}
        onSearch={() => setQuery(search)}
        placeholder="Nº do pedido do cliente..."
      />
      {/* Campo de quantidade de volumes */}
      <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm">
        <span className="text-sm font-medium text-slate-700 shrink-0">Qtd. volumes:</span>
        <input
          type="number"
          min={1}
          max={999}
          value={volumeQty}
          onChange={(e) => setVolumeQty(e.target.value)}
          className="w-20 text-center border border-slate-300 rounded-lg px-2 py-1 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-xs text-slate-400">(será aplicado ao pedido selecionado)</span>
      </div>
      {isLoading && <LoadingRow />}
      {!isLoading && (data?.length ?? 0) === 0 && <EmptyRow />}
      {data?.map((row) => (
        <ItemRow
          key={row.id}
          primary={`Pedido: ${row.customerOrderNumber}`}
          secondary={[row.customerName, row.completedAt ? `Concluído: ${new Date(row.completedAt).toLocaleDateString("pt-BR")}` : null].filter(Boolean).join(" · ")}
          badge={row.hasDivergence ? "Divergência" : row.status === "completed" ? "Concluído" : row.status}
          loading={reprint.isPending && selectedId === row.id}
          onPrint={() => { setSelectedId(row.id); handlePrint(row.id); }}
        />
      ))}
    </SubScreenWrapper>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _ShipmentsSubScreenLegacy({ onBack }: { onBack: () => void }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const { data, isLoading } = trpc.labelReprint.listShipments.useQuery(
    { search: query || undefined, limit: 30 },
    { enabled: true }
  );

  const reprint = trpc.labelReprint.reprintShipment.useMutation({
    onSuccess: (result) => {
      toast.success("Etiqueta gerada!");
      openPdfInNewTab(result.pdf);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <SubScreenWrapper title="Etiquetas de Volumes (Romaneio)" onBack={onBack}>
      <SearchBar
        value={search}
        onChange={setSearch}
        onSearch={() => setQuery(search)}
        placeholder="Romaneio, transportadora ou placa..."
      />
      {isLoading && <LoadingRow />}
      {!isLoading && data?.length === 0 && <EmptyRow />}
      {data?.map((row) => (
        <ItemRow
          key={row.id}
          primary={row.shipmentNumber}
          secondary={[row.carrierName, row.vehiclePlate].filter(Boolean).join(" · ")}
          badge={row.status}
          loading={reprint.isPending}
          onPrint={() => reprint.mutate({ shipmentId: row.id })}
        />
      ))}
    </SubScreenWrapper>
  );
}

function ProductsSubScreen({ onBack }: { onBack: () => void }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const { data, isLoading } = trpc.labelReprint.listProductLabels.useQuery(
    { search: query || undefined, limit: 30 },
    { enabled: true }
  );

  const reprint = trpc.labelReprint.reprintProductLabel.useMutation({
    onSuccess: (result) => {
      toast.success("Etiqueta gerada!");
      openPdfInNewTab(result.pdf);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <SubScreenWrapper title="Etiquetas de Produtos" onBack={onBack}>
      <SearchBar
        value={search}
        onChange={setSearch}
        onSearch={() => setQuery(search)}
        placeholder="Código, SKU ou lote..."
      />
      {isLoading && <LoadingRow />}
      {!isLoading && data?.length === 0 && <EmptyRow />}
      {data?.map((row) => (
        <ItemRow
          key={row.id}
          primary={row.labelCode}
          secondary={[row.productName, row.batch ? `Lote: ${row.batch}` : null]
            .filter(Boolean)
            .join(" · ")}
          badge={row.status}
          loading={reprint.isPending}
          onPrint={() => reprint.mutate({ labelCode: row.labelCode })}
        />
      ))}
    </SubScreenWrapper>
  );
}

function LocationsSubScreen({ onBack }: { onBack: () => void }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showPreview, setShowPreview] = useState(false);

  const { data, isLoading } = trpc.labelReprint.listLocations.useQuery(
    { search: query || undefined, limit: 200 },
    { enabled: true }
  );

  const reprintSingle = trpc.labelReprint.reprintLocation.useMutation({
    onSuccess: (result) => {
      toast.success("Etiqueta gerada!");
      openPdfInNewTab(result.pdf);
    },
    onError: (e) => toast.error(e.message),
  });

  const reprintBatch = trpc.labelReprint.reprintLocationsBatch.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.count} etiqueta(s) gerada(s)!`);
      openPdfInNewTab(result.pdf);
      setSelected(new Set());
      setShowPreview(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const allIds = useMemo(() => data?.map((r) => r.id) ?? [], [data]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allIds));
    }
  };

  const selectedItems = data?.filter((r) => selected.has(r.id)) ?? [];

  return (
    <div className="space-y-3 pb-24">
      {/* Header com botão voltar */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="text-slate-700">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Etiquetas de Endereços</h2>
          <p className="text-sm text-slate-500">Selecione os endereços para reimprimir</p>
        </div>
      </div>

      {/* Barra de busca */}
      <SearchBar
        value={search}
        onChange={setSearch}
        onSearch={() => { setQuery(search); setSelected(new Set()); }}
        placeholder="Código do endereço, zona..."
      />

      {/* Barra de ações de seleção */}
      {!isLoading && (data?.length ?? 0) > 0 && (
        <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-4 py-2.5 shadow-sm">
          <button
            onClick={toggleAll}
            className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors"
          >
            {allSelected ? (
              <CheckSquare className="h-5 w-5 text-blue-600" />
            ) : (
              <Square className="h-5 w-5 text-slate-400" />
            )}
            {allSelected ? "Desmarcar todas" : `Selecionar todas (${allIds.length})`}
          </button>
          {someSelected && (
            <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">
              {selected.size} selecionada{selected.size !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {/* Lista de endereços */}
      {isLoading && <LoadingRow />}
      {!isLoading && (data?.length ?? 0) === 0 && <EmptyRow />}
      {data?.map((row) => {
        const isChecked = selected.has(row.id);
        return (
          <div
            key={row.id}
            className={`flex items-center gap-3 bg-white rounded-xl border px-4 py-3 shadow-sm transition-all ${
              isChecked ? "border-blue-400 bg-blue-50/50" : "border-slate-200"
            }`}
          >
            {/* Checkbox */}
            <button
              onClick={() => toggleOne(row.id)}
              className="shrink-0 text-slate-400 hover:text-blue-600 transition-colors"
            >
              {isChecked ? (
                <CheckSquare className="h-5 w-5 text-blue-600" />
              ) : (
                <Square className="h-5 w-5" />
              )}
            </button>

            {/* Dados do endereço */}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 truncate">{row.code}</p>
              <p className="text-sm text-slate-500 truncate mt-0.5">
                {[row.zoneCode, row.aisle, row.rack, row.level].filter(Boolean).join(" / ")}
              </p>
              {row.status && (
                <Badge variant="outline" className="mt-1 text-xs capitalize">
                  {row.status}
                </Badge>
              )}
            </div>

            {/* Botão imprimir individual */}
            <Button
              size="sm"
              onClick={() => reprintSingle.mutate({ locationId: row.id })}
              disabled={reprintSingle.isPending || reprintBatch.isPending}
              variant="ghost"
              className="shrink-0 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            >
              {reprintSingle.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Printer className="h-4 w-4" />
              )}
            </Button>
          </div>
        );
      })}

      {/* Barra flutuante de ação em lote */}
      {someSelected && (
        <div className="fixed bottom-20 left-0 right-0 z-50 px-4">
          <div className="bg-slate-900 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 max-w-lg mx-auto">
            <div className="flex-1">
              <p className="font-semibold text-sm">
                {selected.size} endereço{selected.size !== 1 ? "s" : ""} selecionado{selected.size !== 1 ? "s" : ""}
              </p>
              <p className="text-xs text-slate-400">Clique em Imprimir para gerar o PDF</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
              className="text-slate-400 hover:text-white hover:bg-slate-700 shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              onClick={() => setShowPreview(true)}
              disabled={reprintBatch.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white shrink-0 gap-1.5"
            >
              {reprintBatch.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck className="h-4 w-4" />
              )}
              Imprimir {selected.size}
            </Button>
          </div>
        </div>
      )}

      {/* Modal de preview / confirmação */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-4 pb-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-lg">Confirmar Impressão</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowPreview(false)}
                className="text-slate-500"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <p className="text-slate-600 text-sm">
              Serão geradas <strong>{selected.size} etiqueta{selected.size !== 1 ? "s" : ""}</strong> em um único PDF:
            </p>

            {/* Lista de endereços selecionados */}
            <div className="max-h-48 overflow-y-auto space-y-1.5 border border-slate-100 rounded-xl p-3 bg-slate-50">
              {selectedItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-800">{item.code}</span>
                  <span className="text-slate-500 text-xs">
                    {[item.zoneCode, item.aisle, item.rack, item.level].filter(Boolean).join(" / ")}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowPreview(false)}
                disabled={reprintBatch.isPending}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white gap-2"
                onClick={() => reprintBatch.mutate({ locationIds: Array.from(selected) })}
                disabled={reprintBatch.isPending}
              >
                {reprintBatch.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Gerando...</>
                ) : (
                  <><Printer className="h-4 w-4" /> Gerar PDF</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared UI atoms
// ---------------------------------------------------------------------------

function SubScreenWrapper({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="text-slate-700">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-xl font-bold text-slate-800">{title}</h2>
          <p className="text-sm text-slate-500">Selecione um item para reimprimir</p>
        </div>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function SearchBar({
  value,
  onChange,
  onSearch,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSearch: () => void;
  placeholder: string;
}) {
  return (
    <div className="flex gap-2">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSearch()}
        placeholder={placeholder}
        className="flex-1 bg-white border-slate-300"
      />
      <Button onClick={onSearch} size="icon" className="bg-blue-600 hover:bg-blue-700 text-white">
        <Search className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ItemRow({
  primary,
  secondary,
  badge,
  loading,
  onPrint,
}: {
  primary: string;
  secondary: string;
  badge?: string | null;
  loading: boolean;
  onPrint: () => void;
}) {
  return (
    <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm">
      <div className="flex-1 min-w-0 mr-3">
        <p className="font-semibold text-slate-800 truncate">{primary}</p>
        {secondary && (
          <p className="text-sm text-slate-500 truncate mt-0.5">{secondary}</p>
        )}
        {badge && (
          <Badge variant="outline" className="mt-1 text-xs capitalize">
            {badge}
          </Badge>
        )}
      </div>
      <Button
        size="sm"
        onClick={onPrint}
        disabled={loading}
        className="bg-slate-700 hover:bg-slate-800 text-white shrink-0"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Printer className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center justify-center py-8 text-slate-500">
      <Loader2 className="h-6 w-6 animate-spin mr-2" />
      <span>Carregando...</span>
    </div>
  );
}

function EmptyRow() {
  return (
    <div className="text-center py-8 text-slate-500">
      <p className="text-sm">Nenhum item encontrado.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CollectorLabelReprint() {
  const [activeType, setActiveType] = useState<LabelType | null>(null);

  const handleBack = useCallback(() => setActiveType(null), []);

  const renderSubScreen = () => {
    switch (activeType) {
      case "receiving":
        return <ReceivingSubScreen onBack={handleBack} />;
      case "waves":
        return <WavesSubScreen onBack={handleBack} />;
      case "shipments":
        return <ShipmentsSubScreen onBack={handleBack} />;
      case "products":
        return <ProductsSubScreen onBack={handleBack} />;
      case "locations":
        return <LocationsSubScreen onBack={handleBack} />;
      default:
        return null;
    }
  };

  return (
    <CollectorLayout title="Coletor de Dados">
      {activeType ? (
        renderSubScreen()
      ) : (
        <div className="space-y-4">
          {/* Header */}
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-bold text-white drop-shadow-lg">
              Reimpressão de Etiquetas
            </h2>
            <p className="text-slate-200 drop-shadow text-sm">
              Escolha o tipo de etiqueta que deseja reimprimir
            </p>
          </div>

          {/* Menu de tipos */}
          <div className="space-y-3">
            {LABEL_TYPES.map((type) => {
              const Icon = type.icon;
              return (
                <button
                  key={type.key}
                  onClick={() => setActiveType(type.key)}
                  className="w-full flex items-center gap-4 bg-white/95 rounded-xl border border-slate-200 px-4 py-4 shadow-sm hover:shadow-md hover:bg-white transition-all text-left"
                >
                  <div className={`p-3 rounded-xl ${type.iconBg} shrink-0`}>
                    <Icon className={`h-7 w-7 ${type.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-base leading-tight">
                      {type.title}
                    </p>
                    <p className="text-sm text-slate-500 mt-0.5 leading-tight">
                      {type.description}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-400 shrink-0" />
                </button>
              );
            })}
          </div>

          {/* Atalhos Rápidos */}
          <div className="bg-white/90 rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-sm font-medium text-slate-600 mb-3">Atalhos Rápidos</p>
            <div className="grid grid-cols-2 gap-3">
              <a href="/stock">
                <Button
                  variant="outline"
                  className="w-full h-12 border-slate-600 bg-slate-800/80 text-white hover:bg-slate-700 hover:text-white"
                >
                  Ver Estoque
                </Button>
              </a>
              <a href="/collector">
                <Button
                  variant="outline"
                  className="w-full h-12 border-slate-600 bg-slate-800/80 text-white hover:bg-slate-700 hover:text-white"
                >
                  Menu Principal
                </Button>
              </a>
            </div>
          </div>
        </div>
      )}
    </CollectorLayout>
  );
}
