/**
 * ClientPortalReceivings.tsx
 *
 * Página de Recebimentos e Movimentações do Portal do Cliente.
 * Rotas:
 *   /portal/recebimentos   → lista de recebimentos
 *   /portal/movimentacoes  → histórico de movimentações
 *
 * Colocar em: client/src/pages/client/ClientPortalReceivings.tsx
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
import {
  Truck, ChevronLeft, ChevronRight, ArrowLeft, Package,
  ArrowLeftRight, CheckCircle, Clock, AlertCircle, FileText,
} from "lucide-react";
import { Link, useParams } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ── Config ─────────────────────────────────────────────────────────────────

type ReceivingStatus = "scheduled" | "in_progress" | "in_quarantine" | "addressing" | "completed" | "cancelled";

const RECEIVING_STATUS_CONFIG: Record<ReceivingStatus, { label: string; color: string }> = {
  scheduled:    { label: "Agendado",      color: "bg-blue-100 text-blue-800 border-blue-200" },
  in_progress:  { label: "Em Progresso",  color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  in_quarantine:{ label: "Quarentena",    color: "bg-orange-100 text-orange-800 border-orange-200" },
  addressing:   { label: "Endereçando",   color: "bg-purple-100 text-purple-800 border-purple-200" },
  completed:    { label: "Concluído",     color: "bg-green-100 text-green-800 border-green-200" },
  cancelled:    { label: "Cancelado",     color: "bg-red-100 text-red-800 border-red-200" },
};

const MOVEMENT_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  receiving:   { label: "Recebimento",   color: "bg-blue-100 text-blue-800" },
  put_away:    { label: "Endereçamento", color: "bg-indigo-100 text-indigo-800" },
  picking:     { label: "Picking",       color: "bg-orange-100 text-orange-800" },
  transfer:    { label: "Transferência", color: "bg-purple-100 text-purple-800" },
  adjustment:  { label: "Ajuste",        color: "bg-yellow-100 text-yellow-800" },
  return:      { label: "Devolução",     color: "bg-teal-100 text-teal-800" },
  disposal:    { label: "Descarte",      color: "bg-red-100 text-red-800" },
  quality:     { label: "Qualidade",     color: "bg-slate-100 text-slate-800" },
};

function ReceivingBadge({ status }: { status: string }) {
  const cfg = RECEIVING_STATUS_CONFIG[status as ReceivingStatus];
  if (!cfg) return <Badge variant="outline">{status}</Badge>;
  return (
    <Badge variant="outline" className={`text-xs font-medium border ${cfg.color}`}>
      {cfg.label}
    </Badge>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LISTA DE RECEBIMENTOS
// ═══════════════════════════════════════════════════════════════════════════

export function ClientPortalReceivings() {
  useClientPortalAuth({ redirectIfUnauthenticated: true });

  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const { data, isLoading } = trpc.clientPortal.receivings.useQuery({
    status: status === "all" ? undefined : (status as ReceivingStatus),
    page,
    pageSize: PAGE_SIZE,
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  return (
    <ClientPortalLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Truck className="h-5 w-5 text-blue-600" />
            Recebimentos
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Histórico de entradas de mercadoria no armazém
          </p>
        </div>
      </div>

      {/* Filtros */}
      <Card className="mb-4 border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="sm:w-52">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {Object.entries(RECEIVING_STATUS_CONFIG).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="font-semibold text-slate-700">Número</TableHead>
                <TableHead className="font-semibold text-slate-700">NF-e</TableHead>
                <TableHead className="font-semibold text-slate-700">Fornecedor</TableHead>
                <TableHead className="font-semibold text-slate-700">Agendado</TableHead>
                <TableHead className="font-semibold text-slate-700">Recebido</TableHead>
                <TableHead className="font-semibold text-slate-700">Status</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : data?.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-slate-400">
                    <Truck className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Nenhum recebimento encontrado</p>
                  </TableCell>
                </TableRow>
              ) : (
                data?.items.map((recv) => (
                  <TableRow key={recv.id} className="hover:bg-slate-50">
                    <TableCell>
                      <Link href={`/portal/recebimentos/${recv.id}`}>
                        <span className="text-blue-600 hover:text-blue-800 font-medium text-sm">
                          #{recv.orderNumber}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      {recv.nfeNumber ? (
                        <div className="flex items-center gap-1 text-xs text-slate-600">
                          <FileText className="h-3.5 w-3.5" />
                          {recv.nfeNumber}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-slate-700">
                      <p className="truncate max-w-[160px]">{recv.supplierName ?? "—"}</p>
                      {recv.supplierCnpj && (
                        <p className="text-xs text-slate-400 font-mono">{recv.supplierCnpj}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {recv.scheduledDate
                        ? format(new Date(recv.scheduledDate), "dd/MM/yyyy", { locale: ptBR })
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {recv.receivedDate
                        ? format(new Date(recv.receivedDate), "dd/MM/yyyy", { locale: ptBR })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <ReceivingBadge status={recv.status} />
                    </TableCell>
                    <TableCell>
                      <Link href={`/portal/recebimentos/${recv.id}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600">
                          <ChevronRightIcon className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50">
            <p className="text-sm text-slate-500">Página {page} de {totalPages}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </ClientPortalLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DETALHE DO RECEBIMENTO
// ═══════════════════════════════════════════════════════════════════════════

export function ClientPortalReceivingDetail() {
  useClientPortalAuth({ redirectIfUnauthenticated: true });
  const { id } = useParams<{ id: string }>();
  const receivingId = parseInt(id ?? "0");

  const { data, isLoading } = trpc.clientPortal.receivingDetail.useQuery(
    { receivingId },
    { enabled: receivingId > 0 }
  );

  if (isLoading) {
    return (
      <ClientPortalLayout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      </ClientPortalLayout>
    );
  }

  if (!data) {
    return (
      <ClientPortalLayout>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-8 text-center text-slate-400">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Recebimento não encontrado.</p>
            <Link href="/portal/recebimentos">
              <Button variant="link" className="text-blue-600 mt-2">← Voltar</Button>
            </Link>
          </CardContent>
        </Card>
      </ClientPortalLayout>
    );
  }

  const { order, items } = data;

  return (
    <ClientPortalLayout>
      <div className="flex items-center gap-2 mb-5 text-sm">
        <Link href="/portal/recebimentos">
          <button className="text-blue-600 hover:text-blue-800 flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Recebimentos
          </button>
        </Link>
        <span className="text-slate-400">/</span>
        <span className="text-slate-600 font-medium">#{order.orderNumber}</span>
      </div>

      <Card className="border-0 shadow-sm mb-4">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-lg font-bold">Recebimento #{order.orderNumber}</CardTitle>
            <ReceivingBadge status={order.status} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Fornecedor",  value: order.supplierName ?? "—" },
              { label: "CNPJ",        value: order.supplierCnpj ?? "—" },
              { label: "NF-e",        value: order.nfeNumber ?? "—" },
              { label: "Recebido em", value: order.receivedDate ? format(new Date(order.receivedDate), "dd/MM/yyyy", { locale: ptBR }) : "—" },
            ].map((f) => (
              <div key={f.label}>
                <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">{f.label}</p>
                <p className="text-sm font-semibold text-slate-900 mt-1">{f.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Itens Recebidos <span className="text-slate-400 font-normal text-sm ml-1">({items.length})</span>
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="font-semibold text-slate-700">SKU</TableHead>
                <TableHead className="font-semibold text-slate-700">Produto</TableHead>
                <TableHead className="font-semibold text-slate-700">Lote</TableHead>
                <TableHead className="font-semibold text-slate-700">Validade</TableHead>
                <TableHead className="font-semibold text-slate-700 text-right">Esperado</TableHead>
                <TableHead className="font-semibold text-slate-700 text-right">Recebido</TableHead>
                <TableHead className="font-semibold text-slate-700">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} className="hover:bg-slate-50">
                  <TableCell className="font-mono text-sm text-slate-700">{item.sku}</TableCell>
                  <TableCell className="text-sm text-slate-900 max-w-[200px] truncate">{item.description}</TableCell>
                  <TableCell className="font-mono text-sm text-slate-600">
                    {item.batch ?? <span className="text-slate-400 italic">Sem lote</span>}
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {item.expiryDate
                      ? format(new Date(item.expiryDate), "dd/MM/yyyy", { locale: ptBR })
                      : <span className="text-slate-400">—</span>}
                  </TableCell>
                  <TableCell className="text-right text-sm text-slate-700">
                    {item.expectedQuantity.toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={`text-sm font-semibold ${
                      (item.receivedQuantity ?? 0) >= item.expectedQuantity
                        ? "text-green-700"
                        : (item.receivedQuantity ?? 0) > 0
                        ? "text-orange-700"
                        : "text-slate-400"
                    }`}>
                      {(item.receivedQuantity ?? 0).toLocaleString("pt-BR")}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge className="text-xs bg-slate-100 text-slate-700">{item.status ?? "—"}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </ClientPortalLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MOVIMENTAÇÕES
// ═══════════════════════════════════════════════════════════════════════════

export function ClientPortalMovements() {
  useClientPortalAuth({ redirectIfUnauthenticated: true });

  const [movementType, setMovementType] = useState<string>("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 30;

  const { data, isLoading } = trpc.clientPortal.movements.useQuery({
    movementType: movementType === "all" ? undefined : movementType as any,
    page,
    pageSize: PAGE_SIZE,
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  return (
    <ClientPortalLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-blue-600" />
            Movimentações
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Histórico completo de entradas, saídas e transferências
          </p>
        </div>
      </div>

      <Card className="mb-4 border-0 shadow-sm">
        <CardContent className="p-4">
          <Select value={movementType} onValueChange={(v) => { setMovementType(v); setPage(1); }}>
            <SelectTrigger className="sm:w-52">
              <SelectValue placeholder="Tipo de Movimentação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {Object.entries(MOVEMENT_TYPE_CONFIG).map(([key, cfg]) => (
                <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="font-semibold text-slate-700">Data</TableHead>
                <TableHead className="font-semibold text-slate-700">Tipo</TableHead>
                <TableHead className="font-semibold text-slate-700">SKU</TableHead>
                <TableHead className="font-semibold text-slate-700">Produto</TableHead>
                <TableHead className="font-semibold text-slate-700">Lote</TableHead>
                <TableHead className="font-semibold text-slate-700 text-right">Quantidade</TableHead>
                <TableHead className="font-semibold text-slate-700">Referência</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : data?.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-slate-400">
                    <ArrowLeftRight className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Nenhuma movimentação encontrada</p>
                  </TableCell>
                </TableRow>
              ) : (
                data?.items.map((mov) => {
                  const typeCfg = MOVEMENT_TYPE_CONFIG[mov.movementType];
                  return (
                    <TableRow key={mov.id} className="hover:bg-slate-50">
                      <TableCell className="text-sm text-slate-600 whitespace-nowrap">
                        {format(new Date(mov.createdAt), "dd/MM/yy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${typeCfg?.color ?? "bg-gray-100 text-gray-600"}`}>
                          {typeCfg?.label ?? mov.movementType}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-slate-700">{mov.sku}</TableCell>
                      <TableCell className="text-sm text-slate-900 max-w-[180px] truncate">{mov.description}</TableCell>
                      <TableCell className="font-mono text-sm text-slate-600">
                        {mov.batch ?? <span className="text-slate-400 italic">—</span>}
                      </TableCell>
                      <TableCell className={`text-right text-sm font-semibold ${mov.quantity >= 0 ? "text-green-700" : "text-red-700"}`}>
                        {mov.quantity >= 0 ? "+" : ""}{mov.quantity.toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {mov.referenceType && mov.referenceId
                          ? `${mov.referenceType} #${mov.referenceId}`
                          : mov.notes ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50">
            <p className="text-sm text-slate-500">Página {page} de {totalPages}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </ClientPortalLayout>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
