import { Button } from "@/components/ui/button";
import { Home, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

interface PageHeaderProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ icon, title, description, actions }: PageHeaderProps) {
  const [, setLocation] = useLocation();

  return (
    <>
      {/* Top Navigation Bar — transparent over background */}
      <header className="bg-black/40 backdrop-blur-sm border-b border-white/10 sticky top-0 z-10">
        <div className="container mx-auto px-4 sm:px-6 py-2 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-1 sm:gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.history.back()}
              className="gap-1 sm:gap-2 h-9 px-2 sm:px-3 text-white hover:text-white hover:bg-white/20"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Voltar</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/")}
              className="gap-1 sm:gap-2 h-9 px-2 sm:px-3 text-white hover:text-white hover:bg-white/20"
            >
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">Início</span>
            </Button>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-blue-400">Med@x</h1>
            <span className="text-xs text-white/60">WMS</span>
          </div>
        </div>
      </header>

      {/* Page Title Section — transparent over background */}
      <div className="bg-transparent">
        <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
            <div className="flex items-start gap-3 sm:gap-4 w-full sm:w-auto">
              {icon && (
                <div className="p-2 sm:p-3 rounded-lg bg-white/20 backdrop-blur-sm text-white flex-shrink-0 shadow-lg">
                  {icon}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white drop-shadow-lg mb-1 sm:mb-2">{title}</h2>
                {description && (
                  <p className="text-sm sm:text-base text-white/80 drop-shadow">{description}</p>
                )}
              </div>
            </div>
            {actions && (
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
                {actions}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
