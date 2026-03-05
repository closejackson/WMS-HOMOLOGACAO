/**
 * ClientPortalStock.tsx
 *
 * Página de Estoque do Portal do Cliente.
 * Rota: /portal/estoque
 *
 * Colocar em: client/src/pages/client/ClientPortalStock.tsx
 */

import { useState } from "react";
import { ClientPortalLayout } from "@/components/ClientPortalLayout";
import { trpc } from "@/lib/trpc";
import { useClientPortalAuth } from "@/hooks/useClientPortalAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, Search, X, AlertTriangle, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type StockStatus = "available" | "quarantine" | "blocked" | "expired";

const STATUS_CONFIG: Record<StockStatus, { label: string; color: string }> = {
  available:  { label: "Disponível",  color: "bg-green-100 text-green-800 border-green-200" },
  quarantine: { label: "Quarentena",  color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  blocked:    { label: "Bloqueado",   color: "bg-red-100 text-red-800 border-red-200" },
  expired:    { label: "Vencido",     color: "bg-slate-100 text-slate-600 border-slate-200" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as StockStatus] ?? { label: status, color: "bg-gray-100 text-gray-600 border-gray-200" };
  return (
    <Badge variant="outline" className={`text-xs font-medium border ${cfg.color}`}>
      {cfg.label}
    </Badge>
  );
}

function isExpiringSoon(expiryDate: Date | string | null): boolean {
  if (!expiryDate) return false;
  const date = new Date(expiryDate);
  const ninetyDays = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  return date <= ninetyDays && date >= new Date();
}

export function ClientPortalStock() {
  useClientPortalAuth({ redirectIfUnauthenticated: true });

  const [search, setSearch] = useState("");
  const [batch, setBatch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const { data: summary } = trpc.clientPortal.stockSummary.useQuery();
  const { data, isLoading, refetch } = trpc.clientPortal.stockPositions.useQuery({
    search: search || undefined,
    batch: batch || undefined,
    status: status === "all" ? undefined : (status as StockStatus),
    page,
    pageSize: PAGE_SIZE,
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  const handleClear = () => {
    setSearch("");
    setBatch("");
    setStatus("all");
    setPage(1);
  };

  const hasFilters = search || batch || status !== "all";

  return (
    <ClientPortalLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-600" />
            Posições de Estoque
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {data?.total !== undefined
              ? `${data.total.toLocaleString("pt-BR")} registro(s) encontrado(s)`
              : "Carregando..."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="shrink-0">
          <RefreshCw className="h-4 w-4 mr-1.5" /> Atualizar
        </Button>
      </div>

      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Total Disponível", value: summary.availableQuantity.toLocaleString("pt-BR"), color: "text-green-600" },
            { label: "Reservado",        value: summary.reservedQuantity.toLocaleString("pt-BR"),  color: "text-orange-600" },
            { label: "Produtos",         value: summary.distinctProducts.toLocaleString("pt-BR"),  color: "text-blue-600" },
            { label: "A Vencer (90d)",   value: summary.expiringIn90Days.toLocaleString("pt-BR"),  color: summary.expiringIn90Days > 0 ? "text-amber-600" : "text-slate-500" },
          ].map((kpi) => (
            <Card key={kpi.label} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500 font-medium">{kpi.label}</p>
                <p className={`text-xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filtros */}
      <Card className="mb-4 border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por produto, SKU..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <Input
              placeholder="Lote..."
              value={batch}
              onChange={(e) => { setBatch(e.target.value); setPage(1); }}
              className="sm:w-40"
            />
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="sm:w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={handleClear} className="text-slate-500">
                <X className="h-4 w-4 mr-1" /> Limpar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="font-semibold text-slate-700">SKU</TableHead>
                <TableHead className="font-semibold text-slate-700">Produto</TableHead>
                <TableHead className="font-semibold text-slate-700">Lote</TableHead>
                <TableHead className="font-semibold text-slate-700">Validade</TableHead>
                <TableHead className="font-semibold text-slate-700 text-right">Disponível</TableHead>
                <TableHead className="font-semibold text-slate-700 text-right">Reservado</TableHead>
                <TableHead className="font-semibold text-slate-700">Endereço</TableHead>
                <TableHead className="font-semibold text-slate-700">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : data?.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-slate-400">
                    <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">Nenhuma posição de estoque encontrada</p>
                    {hasFilters && (
                      <Button variant="link" size="sm" onClick={handleClear} className="mt-2 text-blue-600">
                        Limpar filtros
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                data?.items.map((item) => {
                  const expiringSoon = isExpiringSoon(item.expiryDate);
                  return (
                    <TableRow key={item.inventoryId} className={`hover:bg-slate-50 ${expiringSoon ? "bg-amber-50/40" : ""}`}>
                      <TableCell className="font-mono text-sm font-medium text-slate-700">
                        {item.sku}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <p className="text-sm text-slate-900 truncate">{item.description}</p>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-slate-600">
                        {item.batch ?? <span className="text-slate-400 italic">Sem lote</span>}
                      </TableCell>
                      <TableCell>
                        {item.expiryDate ? (
                          <div className="flex items-center gap-1.5">
                            {expiringSoon && (
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            )}
                            <span className={`text-sm ${expiringSoon ? "text-amber-700 font-medium" : "text-slate-600"}`}>
                              {format(new Date(item.expiryDate), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-slate-900">
                        {item.availableQuantity.toLocaleString("pt-BR")}{" "}
                        <span className="text-xs text-slate-400 font-normal">{item.unitOfMeasure}</span>
                      </TableCell>
                      <TableCell className="text-right text-slate-600">
                        {(item.reservedQuantity ?? 0) > 0
                          ? item.reservedQuantity?.toLocaleString("pt-BR")
                          : <span className="text-slate-300">0</span>}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p className="font-medium text-slate-700">{item.code}</p>
                          <p className="text-xs text-slate-400">{item.zoneName}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={item.status} />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50">
            <p className="text-sm text-slate-500">
              Página {page} de {totalPages} · {data?.total.toLocaleString("pt-BR")} registros
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </ClientPortalLayout>
  );
}
