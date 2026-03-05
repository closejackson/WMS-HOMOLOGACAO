import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Package, Scan, TruckIcon, ArrowLeftRight, Home } from "lucide-react";
import { Button } from "./ui/button";
import { SyncStatusBadge } from "./SyncStatusIndicator";

interface CollectorLayoutProps {
  children: ReactNode;
  title: string;
}

export function CollectorLayout({ children, title }: CollectorLayoutProps) {
  const [location] = useLocation();

  const navItems = [
    { path: "/collector", icon: Home, label: "Início" },
    { path: "/collector/receiving", icon: Package, label: "Recebimento" },
    { path: "/collector/picking", icon: Scan, label: "Picking" },
    { path: "/collector/stage", icon: TruckIcon, label: "Stage" },
    { path: "/collector/movement", icon: ArrowLeftRight, label: "Movimentação" },
  ];

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-700 bg-slate-900/90 backdrop-blur">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Scan className="h-6 w-6 text-blue-400" />
            <h1 className="text-xl font-bold text-white">{title}</h1>
          </div>
          <SyncStatusBadge />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-slate-100">
        <div className="container px-4 py-6">
          {children}
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="sticky bottom-0 z-50 w-full border-t border-slate-700 bg-slate-900/95 backdrop-blur">
        <div className="container grid grid-cols-5 gap-1 p-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;
            
            return (
              <Link key={item.path} href={item.path}>
                <Button
                  variant={isActive ? "default" : "ghost"}
                  className={`h-16 w-full flex-col gap-1 text-xs ${!isActive ? "text-slate-300 hover:text-white hover:bg-slate-800" : ""}`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="truncate">{item.label}</span>
                </Button>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
