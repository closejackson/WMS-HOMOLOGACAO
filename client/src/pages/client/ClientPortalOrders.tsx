/**
 * ClientPortalOrders.tsx
 *
 * Página de Pedidos do Portal do Cliente.
 * Rota: /portal/pedidos  e  /portal/pedidos/:id
 *
 * Colocar em: client/src/pages/client/ClientPortalOrders.tsx
 */

import { useState } from "react";
import { ClientPortalLayout } from "@/components/ClientPortalLayout";
import { trpc } from "@/lib/trpc";
import { useClientPortalAuth } from "@/hooks/useClientPortalAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  ShoppingCart, Search, X, ArrowLeft, Package, ChevronLeft, ChevronRight,
  Truck, CheckCircle, Clock, AlertCircle, FileText,
} from "lucide-react";
import { Link, useParams } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type OrderStatus =
  | "pending" | "validated" | "in_wave" | "picking" | "picked"
  | "checking" | "packed" | "staged" | "invoiced" | "shipped" | "cancelled";

const ORDER_STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; icon: typeof Clock }> = {
  pending:   { label: "Pendente",   color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock },
  validated: { label: "Validado",   color: "bg-blue-100 text-blue-800 border-blue-200",       icon: CheckCircle },
  in_wave:   { label: "Em Onda",    color: "bg-purple-100 text-purple-800 border-purple-200", icon: Package },
  picking:   { label: "Separando",  color: "bg-orange-100 text-orange-800 border-orange-200", icon: Package },
  picked:    { label: "Separado",   color: "bg-cyan-100 text-cyan-800 border-cyan-200",       icon: CheckCircle },
  checking:  { label: "Conferindo", color: "bg-indigo-100 text-indigo-800 border-indigo-200", icon: Clock },
  packed:    { label: "Embalado",   color: "bg-teal-100 text-teal-800 border-teal-200",       icon: Package },
  staged:    { label: "Em Stage",   color: "bg-pink-100 text-pink-800 border-pink-200",       icon: Truck },
  invoiced:  { label: "Faturado",   color: "bg-green-100 text-green-800 border-green-200",    icon: CheckCircle },
  shipped:   { label: "Expedido",   color: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: Truck },
  cancelled: { label: "Cancelado",  color: "bg-red-100 text-red-800 border-red-200",          icon: AlertCircle },
};

const ITEM_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:  { label: "Pendente",  color: "bg-yellow-100 text-yellow-800" },
  picked:   { label: "Separado",  color: "bg-green-100 text-green-800" },
  partial:  { label: "Parcial",   color: "bg-orange-100 text-orange-800" },
  cancelled:{ label: "Cancelado", color: "bg-red-100 text-red-800" },
};

function OrderBadge({ status }: { status: string }) {
  const cfg = ORDER_STATUS_CONFIG[status as OrderStatus];
  if (!cfg) return <Badge variant="outline">{status}</Badge>;
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`text-xs font-medium border ${cfg.color} gap-1`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

// ── Lista de Pedidos ───────────────────────────────────────────────────────

export function ClientPortalOrders() {
  useClientPortalAuth({ redirectIfUnauthenticated: true });

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const { data, isLoading } = trpc.clientPortal.orders.useQuery({
    search: search || undefined,
    status: status === "all" ? undefined : (status as OrderStatus),
    page,
    pageSize: PAGE_SIZE,
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);
  const hasFilters = search || status !== "all";

  return (
    <ClientPortalLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-blue-600" />
            Pedidos de Saída
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {data?.total !== undefined
              ? `${data.total.toLocaleString("pt-BR")} pedido(s) encontrado(s)`
              : "Carregando..."}
          </p>
        </div>
        <Link href="/portal/pedidos/novo">
          <Button className="bg-blue-600 hover:bg-blue-700 gap-2">
            <Package className="h-4 w-4" />
            Novo Pedido
          </Button>
        </Link>
      </div>

      {/* Filtros */}
      <Card className="mb-4 border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por número do pedido..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="sm:w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {Object.entries(ORDER_STATUS_CONFIG).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatus("all"); setPage(1); }}>
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
                <TableHead className="font-semibold text-slate-700">Pedido</TableHead>
                <TableHead className="font-semibold text-slate-700">Ref. Cliente</TableHead>
                <TableHead className="font-semibold text-slate-700">Data</TableHead>
                <TableHead className="font-semibold text-slate-700 text-center">Itens</TableHead>
                <TableHead className="font-semibold text-slate-700 text-right">Qtd. Total</TableHead>
                <TableHead className="font-semibold text-slate-700">Status</TableHead>
                <TableHead className="font-semibold text-slate-700">NF-e</TableHead>
                <TableHead className="font-semibold text-slate-700 text-right">Ações</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : data?.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-slate-400">
                    <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">Nenhum pedido encontrado</p>
                  </TableCell>
                </TableRow>
              ) : (
                data?.items.map((order) => (
                  <TableRow key={order.id} className="hover:bg-slate-50 cursor-pointer">
                    <TableCell>
                      <Link href={`/portal/pedidos/${order.id}`}>
                        <span className="text-blue-600 hover:text-blue-800 font-medium text-sm">
                          #{order.orderNumber}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {order.customerOrderNumber ?? <span className="text-slate-300">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {format(new Date(order.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-center text-sm text-slate-700 font-medium">
                      {order.totalItems}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold text-slate-900">
                      {order.totalQuantity.toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      <OrderBadge status={order.status} />
                    </TableCell>
                    <TableCell>
                      {order.nfeNumber ? (
                        <div className="flex items-center gap-1 text-xs text-slate-600">
                          <FileText className="h-3.5 w-3.5" />
                          {order.nfeNumber}
                        </div>
                      ) : (
                        <span className="text-slate-300 text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {order.status === "pending" && (
                          <>
                            <Link href={`/portal/pedidos/${order.id}/editar`}>
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50">
                                Editar
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-red-600 hover:text-red-800 hover:bg-red-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Tem certeza que deseja cancelar o pedido ${order.orderNumber}?`)) {
                                  // TODO: Implementar cancelamento
                                  alert("Funcionalidade de cancelamento será implementada");
                                }
                              }}
                            >
                              Cancelar
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link href={`/portal/pedidos/${order.id}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600">
                          <ChevronRight className="h-4 w-4" />
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
            <p className="text-sm text-slate-500">
              Página {page} de {totalPages}
            </p>
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

// ── Detalhe do Pedido ──────────────────────────────────────────────────────

export function ClientPortalOrderDetail() {
  useClientPortalAuth({ redirectIfUnauthenticated: true });
  const { id } = useParams<{ id: string }>();
  const orderId = parseInt(id ?? "0");

  const { data, isLoading } = trpc.clientPortal.orderDetail.useQuery(
    { orderId },
    { enabled: orderId > 0 }
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
            <p className="font-medium">Pedido não encontrado.</p>
            <Link href="/portal/pedidos">
              <Button variant="link" className="text-blue-600 mt-2">← Voltar para pedidos</Button>
            </Link>
          </CardContent>
        </Card>
      </ClientPortalLayout>
    );
  }

  const { order, items } = data;
  const cfg = ORDER_STATUS_CONFIG[order.status as OrderStatus];

  return (
    <ClientPortalLayout>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-5 text-sm">
        <Link href="/portal/pedidos">
          <button className="text-blue-600 hover:text-blue-800 flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Pedidos
          </button>
        </Link>
        <span className="text-slate-400">/</span>
        <span className="text-slate-600 font-medium">#{order.orderNumber}</span>
      </div>

      {/* Header do pedido */}
      <Card className="border-0 shadow-sm mb-4">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-bold text-slate-900">
                Pedido #{order.orderNumber}
              </CardTitle>
              {order.customerOrderNumber && (
                <CardDescription className="mt-1">
                  Ref. cliente: {order.customerOrderNumber}
                </CardDescription>
              )}
            </div>
            {cfg && (
              <Badge
                variant="outline"
                className={`text-sm font-semibold border ${cfg.color} px-3 py-1 self-start`}
              >
                {cfg.label}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Data do Pedido",    value: format(new Date(order.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR }) },
              { label: "Itens",             value: `${order.totalItems} linha(s)` },
              { label: "Quantidade Total",  value: order.totalQuantity.toLocaleString("pt-BR") },
              { label: "Expedição",         value: order.shippedAt ? format(new Date(order.shippedAt), "dd/MM/yyyy", { locale: ptBR }) : "—" },
            ].map((field) => (
              <div key={field.label}>
                <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">{field.label}</p>
                <p className="text-sm font-semibold text-slate-900 mt-1">{field.value}</p>
              </div>
            ))}
          </div>

          {(order.nfeNumber || order.notes) && (
            <>
              <Separator className="my-4" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {order.nfeNumber && (
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">NF-e</p>
                    <div className="flex items-center gap-2 mt-1">
                      <FileText className="h-4 w-4 text-slate-400" />
                      <span className="text-sm font-medium text-slate-900">{order.nfeNumber}</span>
                    </div>
                    {order.nfeKey && (
                      <p className="text-xs text-slate-400 font-mono mt-1 break-all">{order.nfeKey}</p>
                    )}
                  </div>
                )}
                {order.notes && (
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Observações</p>
                    <p className="text-sm text-slate-700 mt-1">{order.notes}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Itens do pedido */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Itens do Pedido <span className="text-slate-400 font-normal text-sm ml-1">({items.length})</span>
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
                <TableHead className="font-semibold text-slate-700 text-right">Solicitado</TableHead>
                <TableHead className="font-semibold text-slate-700 text-right">Separado</TableHead>
                <TableHead className="font-semibold text-slate-700">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const itemCfg = ITEM_STATUS_CONFIG[item.status ?? "pending"];
                return (
                  <TableRow key={item.id} className="hover:bg-slate-50">
                    <TableCell className="font-mono text-sm font-medium text-slate-700">{item.sku}</TableCell>
                    <TableCell>
                      <p className="text-sm text-slate-900 max-w-[220px] truncate">{item.description}</p>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-slate-600">
                      {item.batch ?? <span className="text-slate-400 italic">Sem lote</span>}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {item.expiryDate
                        ? format(new Date(item.expiryDate), "dd/MM/yyyy", { locale: ptBR })
                        : <span className="text-slate-400">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-sm text-slate-700">
                      {item.requestedQuantity.toLocaleString("pt-BR")} {item.unit}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`text-sm font-semibold ${
                        (item.pickedQuantity ?? 0) >= item.requestedQuantity
                          ? "text-green-700"
                          : (item.pickedQuantity ?? 0) > 0
                          ? "text-orange-700"
                          : "text-slate-400"
                      }`}>
                        {(item.pickedQuantity ?? 0).toLocaleString("pt-BR")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${itemCfg?.color ?? "bg-gray-100 text-gray-600"}`}>
                        {itemCfg?.label ?? item.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </ClientPortalLayout>
  );
}
