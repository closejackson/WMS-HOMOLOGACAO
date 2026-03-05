/**
 * ClientPortalLayout.tsx
 *
 * Layout principal do Portal do Cliente.
 * Sidebar responsiva com navegação entre as seções do portal.
 * Diferenciado visualmente do painel WMS (fundo escuro azul-marinho).
 *
 * Colocar em: client/src/components/ClientPortalLayout.tsx
 */

import { ReactNode, useState } from "react";
import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Truck,
  ArrowLeftRight,
  LogOut,
  Menu,
  X,
  Bell,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useIsMobile } from "@/hooks/useMobile";
import { toast } from "sonner";
import { useLocation as useWouterLocation } from "wouter";

// ── Itens de navegação ─────────────────────────────────────────────────────
const NAV_ITEMS = [
  {
    icon: LayoutDashboard,
    label: "Dashboard",
    path: "/portal",
    description: "Visão geral",
  },
  {
    icon: Package,
    label: "Estoque",
    path: "/portal/estoque",
    description: "Posições e saldos",
  },
  {
    icon: ShoppingCart,
    label: "Pedidos",
    path: "/portal/pedidos",
    description: "Pedidos de saída",
  },
  {
    icon: Truck,
    label: "Recebimentos",
    path: "/portal/recebimentos",
    description: "Entradas de mercadoria",
  },
  {
    icon: ArrowLeftRight,
    label: "Movimentações",
    path: "/portal/movimentacoes",
    description: "Histórico de movimentos",
  },
] as const;

// ── Tipos ──────────────────────────────────────────────────────────────────
interface ClientPortalLayoutProps {
  children: ReactNode;
}

// ── Componente Principal ───────────────────────────────────────────────────
export function ClientPortalLayout({ children }: ClientPortalLayoutProps) {
  const [location] = useLocation();
  const [, setLocation] = useWouterLocation();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const meQuery = trpc.clientPortal.me.useQuery();
  const logoutMutation = trpc.clientPortal.logout.useMutation({
    onSuccess: () => {
      toast.success("Sessão encerrada.");
      setLocation("/portal/login");
    },
  });

  const user = meQuery.data;
  const initials = user?.fullName
    ?.split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase() ?? "?";

  const handleLogout = () => logoutMutation.mutate();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Sidebar Desktop ─────────────────────────────────────────────── */}
      <aside
        className={`
          hidden lg:flex flex-col w-64 bg-slate-900 text-white shrink-0
          border-r border-slate-800
        `}
      >
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-800">
          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center shrink-0">
            <Package className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate text-white">Med@x WMS</p>
            <p className="text-xs text-slate-400 truncate">Portal do Cliente</p>
          </div>
        </div>

        {/* Tenant info */}
        {user && (
          <div className="px-4 py-3 border-b border-slate-800">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Empresa</p>
            <p className="text-sm font-medium text-white truncate">{user.tenantName}</p>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.path === "/portal"
                ? location === "/portal"
                : location.startsWith(item.path);
            const Icon = item.icon;

            return (
              <Link key={item.path} href={item.path}>
                <button
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left
                    transition-colors group
                    ${
                      isActive
                        ? "bg-blue-600 text-white"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                    }
                  `}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      isActive ? "text-white" : "text-slate-400 group-hover:text-white"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.label}</p>
                    <p
                      className={`text-xs truncate ${
                        isActive ? "text-blue-200" : "text-slate-500"
                      }`}
                    >
                      {item.description}
                    </p>
                  </div>
                  {isActive && (
                    <ChevronRight className="h-3.5 w-3.5 text-blue-200 shrink-0" />
                  )}
                </button>
              </Link>
            );
          })}
        </nav>

        {/* Footer: user + logout */}
        <div className="p-3 border-t border-slate-800">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-800 transition-colors">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="bg-blue-600 text-white text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.fullName ?? "Carregando..."}
              </p>
              <p className="text-xs text-slate-400 truncate">{user?.email}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
              title="Sair"
              className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-700 shrink-0"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* ── Mobile Overlay Menu ────────────────────────────────────────── */}
      {isMobile && mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 w-72 bg-slate-900 text-white flex flex-col h-full">
            <div className="h-14 flex items-center justify-between px-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-blue-400" />
                <span className="font-semibold text-white">Portal do Cliente</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {user && (
              <div className="px-4 py-3 border-b border-slate-800">
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">
                  Empresa
                </p>
                <p className="text-sm font-medium text-white">{user.tenantName}</p>
              </div>
            )}

            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const isActive =
                  item.path === "/portal"
                    ? location === "/portal"
                    : location.startsWith(item.path);
                const Icon = item.icon;

                return (
                  <Link key={item.path} href={item.path}>
                    <button
                      className={`
                        w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left
                        transition-colors
                        ${
                          isActive
                            ? "bg-blue-600 text-white"
                            : "text-slate-300 hover:bg-slate-800 hover:text-white"
                        }
                      `}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="text-sm font-medium">{item.label}</span>
                    </button>
                  </Link>
                );
              })}
            </nav>

            <div className="p-3 border-t border-slate-800">
              <button
                onClick={handleLogout}
                disabled={logoutMutation.isPending}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-400 hover:bg-slate-800 hover:text-red-300 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span className="text-sm font-medium">Sair</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        {isMobile && (
          <header className="h-14 bg-slate-900 flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(true)}
                className="text-slate-300 hover:text-white h-9 w-9"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-blue-400" />
                <span className="text-white font-semibold text-sm">
                  {NAV_ITEMS.find(
                    (i) =>
                      i.path === location ||
                      (i.path !== "/portal" && location.startsWith(i.path))
                  )?.label ?? "Portal"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-blue-600 text-white text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </div>
          </header>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-slate-50">
          <div className="p-4 lg:p-6 max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
