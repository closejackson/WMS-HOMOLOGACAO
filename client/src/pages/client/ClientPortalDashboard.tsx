/**
 * ClientPortalDashboard.tsx
 *
 * Dashboard principal do Portal do Cliente.
 * Rota: /portal
 *
 * Colocar em: client/src/pages/client/ClientPortalDashboard.tsx
 */

import { ClientPortalLayout } from "@/components/ClientPortalLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Package, ShoppingCart, Truck, ArrowRight, AlertTriangle,
  CheckCircle, Clock, XCircle, Box, TrendingDown,
} from "lucide-react";
import { Link } from "wouter";
import { useClientPortalAuth } from "@/hooks/useClientPortalAuth";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ── Helpers ────────────────────────────────────────────────────────────────

const ORDER_STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending:   { label: "Pendente",   color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock },
  validated: { label: "Validado",   color: "bg-blue-100 text-blue-800 border-blue-200",       icon: CheckCircle },
  in_wave:   { label: "Em Onda",    color: "bg-purple-100 text-purple-800 border-purple-200", icon: Package },
  picking:   { label: "Separando",  color: "bg-orange-100 text-orange-800 border-orange-200", icon: Package },
  picked:    { label: "Separado",   color: "bg-cyan-100 text-cyan-800 border-cyan-200",       icon: CheckCircle },
  checking:  { label: "Conferindo", color: "bg-indigo-100 text-indigo-800 border-indigo-200", icon: Clock },
  packed:    { label: "Embalado",   color: "bg-teal-100 text-teal-800 border-teal-200",       icon: Box },
  staged:    { label: "Em Stage",   color: "bg-pink-100 text-pink-800 border-pink-200",       icon: Truck },
  invoiced:  { label: "Faturado",   color: "bg-green-100 text-green-800 border-green-200",    icon: CheckCircle },
  shipped:   { label: "Expedido",   color: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: Truck },
  cancelled: { label: "Cancelado",  color: "bg-red-100 text-red-800 border-red-200",          icon: XCircle },
};

function OrderStatusBadge({ status }: { status: string }) {
  const cfg = ORDER_STATUS_CONFIG[status] ?? { label: status, color: "bg-gray-100 text-gray-600 border-gray-200", icon: Clock };
  return (
    <Badge variant="outline" className={`text-xs font-medium border ${cfg.color}`}>
      {cfg.label}
    </Badge>
  );
}

function StatCard({
  title, value, subtitle, icon: Icon, color, linkTo,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: typeof Package;
  color: string;
  linkTo?: string;
}) {
  const inner = (
    <Card className="hover:shadow-md transition-shadow cursor-pointer">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground truncate">{title}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1 truncate">{subtitle}</p>
            )}
          </div>
          <div className={`p-3 rounded-xl ${color} shrink-0 ml-4`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return linkTo ? <Link href={linkTo}>{inner}</Link> : inner;
}

// ── Componente Principal ───────────────────────────────────────────────────

export function ClientPortalDashboard() {
  const { user } = useClientPortalAuth({ redirectIfUnauthenticated: true });

  const { data: stockSummary, isLoading: loadingStock } = trpc.clientPortal.stockSummary.useQuery();
  const { data: ordersSummary, isLoading: loadingOrders } = trpc.clientPortal.ordersSummary.useQuery();
  const { data: recentOrders, isLoading: loadingRecent } = trpc.clientPortal.orders.useQuery({
    pageSize: 5,
    page: 1,
  });
  const { data: expiring } = trpc.clientPortal.expiringProducts.useQuery({ days: 30 });

  const activeOrders = Object.entries(ordersSummary?.byStatus ?? {})
    .filter(([s]) => !["shipped", "cancelled"].includes(s))
    .reduce((sum, [, v]) => sum + v.count, 0);

  const todayLabel = format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR });

  return (
    <ClientPortalLayout>
      {/* Cabeçalho de boas-vindas */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Olá, {user?.fullName?.split(" ")[0] ?? "Bem-vindo"}!
        </h1>
        <p className="text-slate-500 text-sm mt-1 capitalize">{todayLabel}</p>
      </div>

      {/* Alertas */}
      {expiring && expiring.length > 0 && (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900">
                {expiring.length} produto(s) vencendo nos próximos 30 dias
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                {expiring.slice(0, 2).map(p => p.description).join(", ")}
                {expiring.length > 2 ? ` e mais ${expiring.length - 2}` : ""}
              </p>
            </div>
            <Link href="/portal/estoque?alerta=vencimento">
              <Button size="sm" variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-100 shrink-0">
                Ver todos <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {loadingStock ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))
        ) : (
          <>
            <StatCard
              title="Itens em Estoque"
              value={stockSummary?.availableQuantity?.toLocaleString("pt-BR") ?? "0"}
              subtitle={`${stockSummary?.distinctProducts ?? 0} produtos distintos`}
              icon={Package}
              color="bg-blue-100 text-blue-600"
              linkTo="/portal/estoque"
            />
            <StatCard
              title="Qtd. Reservada"
              value={stockSummary?.reservedQuantity?.toLocaleString("pt-BR") ?? "0"}
              subtitle="Aguardando expedição"
              icon={Box}
              color="bg-orange-100 text-orange-600"
              linkTo="/portal/estoque"
            />
            <StatCard
              title="Pedidos Ativos"
              value={activeOrders}
              subtitle="Em andamento"
              icon={ShoppingCart}
              color="bg-green-100 text-green-600"
              linkTo="/portal/pedidos"
            />
            <StatCard
              title="A Vencer (90d)"
              value={stockSummary?.expiringIn90Days ?? 0}
              subtitle="Itens próximos ao vencimento"
              icon={AlertTriangle}
              color={stockSummary?.expiringIn90Days ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"}
              linkTo="/portal/estoque"
            />
          </>
        )}
      </div>

      {/* Grid inferior: pedidos recentes + resumo de status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pedidos recentes */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Pedidos Recentes</CardTitle>
              <Link href="/portal/pedidos">
                <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 -mr-2">
                  Ver todos <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {loadingRecent ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : recentOrders?.items.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <ShoppingCart className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Nenhum pedido encontrado</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentOrders?.items.map((order) => (
                  <Link href={`/portal/pedidos/${order.id}`} key={order.id}>
                    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100 cursor-pointer">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          #{order.orderNumber}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {order.totalItems} item(ns) ·{" "}
                          {format(new Date(order.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <OrderStatusBadge status={order.status} />
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status dos pedidos */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Status dos Pedidos</CardTitle>
            <CardDescription className="text-xs">Distribuição atual</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingOrders ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : Object.keys(ordersSummary?.byStatus ?? {}).length === 0 ? (
              <div className="text-center py-6 text-slate-400">
                <p className="text-sm">Sem dados</p>
              </div>
            ) : (
              <div className="space-y-2">
                {Object.entries(ordersSummary?.byStatus ?? {})
                  .sort(([, a], [, b]) => b.count - a.count)
                  .map(([status, data]) => {
                    const cfg = ORDER_STATUS_CONFIG[status];
                    return (
                      <div key={status} className="flex items-center justify-between py-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${
                            cfg?.color.includes("blue") ? "bg-blue-500" :
                            cfg?.color.includes("green") || cfg?.color.includes("emerald") ? "bg-green-500" :
                            cfg?.color.includes("orange") ? "bg-orange-500" :
                            cfg?.color.includes("red") ? "bg-red-500" :
                            cfg?.color.includes("yellow") ? "bg-yellow-500" :
                            "bg-slate-400"
                          }`} />
                          <span className="text-sm text-slate-600 truncate">
                            {cfg?.label ?? status}
                          </span>
                        </div>
                        <span className="text-sm font-semibold text-slate-900 shrink-0 ml-2">
                          {data.count}
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ClientPortalLayout>
  );
}

// Importação que faltou no JSX
function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
