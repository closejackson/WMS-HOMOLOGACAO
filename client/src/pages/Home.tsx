import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLoginUrl } from "@/const";
import { 
  ClipboardCheck, 
  Package, 
  Truck, 
  FileText, 
  Upload,
  BarChart3,
  Warehouse,
  Shield,
  CheckSquare,
  Smartphone,
  Printer,
  Loader2
} from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const { data: dashStats, isLoading: statsLoading } = trpc.dashboard.stats.useQuery(
    undefined,
    { enabled: isAuthenticated, refetchInterval: 30000 } // Atualiza a cada 30s
  );

  // Estado de carregamento
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-white/70">Carregando...</p>
        </div>
      </div>
    );
  }

  // Usuário não autenticado - mostrar tela de login
  if (!isAuthenticated) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center bg-cover bg-center bg-no-repeat relative"
        style={{
          backgroundImage: 'url(https://files.manuscdn.com/user_upload_by_module/session_file/310519663187653950/KsiBngXQYgMVVNPi.jpg)'
        }}
      >
        {/* Overlay escuro para melhorar legibilidade */}
        <div className="absolute inset-0 bg-black/40"></div>
        <Card className="w-full max-w-md mx-4 relative z-10">
          <CardHeader className="text-center">
            <div className="mb-4">
              <h1 className="text-4xl font-bold text-primary">Med@x</h1>
              <p className="text-sm text-muted-foreground mt-1">WMS</p>
            </div>
            <CardTitle className="text-2xl">Sistema de Gerenciamento de Armazém</CardTitle>
            <CardDescription>
              Gerencie todas as operações do seu armazém farmacêutico de forma eficiente
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full" size="lg">
              <a href={getLoginUrl()}>Entrar no Sistema</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Definição de módulos com suas propriedades
  const modules = [
    {
      title: "Recebimento",
      description: "Agendamento e conferência de mercadorias que chegam ao armazém",
      icon: ClipboardCheck,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      features: [
        "Agendar recebimentos",
        "Conferir mercadorias",
        "Registrar entradas"
      ],
      href: "/receiving"
    },
    {
      title: "Separação",
      description: "Picking e separação de pedidos para expedição",
      icon: Package,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      features: [
        "Listar pedidos",
        "Separar itens",
        "Confirmar picking"
      ],
      href: "/picking"
    },
    {
      title: "Coletor de Dados",
      description: "Interface otimizada para dispositivos móveis com scanner",
      icon: Smartphone,
      color: "text-indigo-600",
      bgColor: "bg-indigo-50",
      features: [
        "Recebimento mobile",
        "Picking mobile",
        "Stage mobile",
        "Movimentações"
      ],
      href: "/collector"
    },
    {
      title: "Stage",
      description: "Conferência de expedição com validação cega",
      icon: CheckSquare,
      color: "text-green-600",
      bgColor: "bg-green-50",
      features: [
        "Conferir pedidos",
        "Validar quantidades",
        "Baixar estoque"
      ],
      href: "/stage/check"
    },
    {
      title: "Expedição",
      description: "Carregamento e rastreamento de mercadorias",
      icon: Truck,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      features: [
        "Carregar veículos",
        "Rastrear entregas",
        "Confirmar expedições"
      ],
      href: "/shipping"
    },
    {
      title: "Cadastros",
      description: "Gestão de dados mestre do sistema",
      icon: FileText,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
      features: [
        "Cadastrar clientes",
        "Gerenciar produtos",
        "Configurar endereços",
        "Gerenciar usuários"
      ],
      href: "/cadastros"
    },
    {
      title: "Importação NF",
      description: "Upload de XML de notas fiscais",
      icon: Upload,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
      features: [
        "Importar XML",
        "Gerar OTs automaticamente",
        "Histórico de importações"
      ],
      href: "/nfe-import"
    },
    {
      title: "Estoque",
      description: "Controle e rastreabilidade de inventário",
      icon: Warehouse,
      color: "text-green-600",
      bgColor: "bg-green-50",
      features: [
        "Consultar posições",
        "Movimentações",
        "Dashboard de ocupação",
        "Histórico de etiquetas"
      ],
      href: "/stock"
    },
    {
      title: "Relatórios",
      description: "KPIs, dashboards e auditoria",
      icon: BarChart3,
      color: "text-cyan-600",
      bgColor: "bg-cyan-50",
      features: [
        "Rastreabilidade",
        "Performance",
        "Conformidade"
      ],
      href: "/reports"
    },
    {
      title: "Admin",
      description: "Gerenciamento e limpeza de dados do sistema",
      icon: Shield,
      color: "text-red-600",
      bgColor: "bg-red-50",
      features: [
        "Limpeza de dados",
        "Auditoria",
        "Conformidade"
      ],
      href: "/admin"
    },
    {
      title: "Reimpressão de Etiquetas",
      description: "Reimprima etiquetas de recebimento, separação, volumes, produtos e endereços",
      icon: Printer,
      color: "text-teal-600",
      bgColor: "bg-teal-50",
      features: [
        "Etiquetas de recebimento",
        "Etiquetas de separação",
        "Etiquetas de volumes",
        "Etiquetas de produtos",
        "Etiquetas de endereços"
      ],
      href: "/collector/label-reprint"
    }
  ];

  // Estatísticas rápidas — dados reais do banco
  const stats = [
    { label: "Recebimentos Hoje",    value: dashStats?.receivingToday   ?? null },
    { label: "Pedidos em Separação", value: dashStats?.pickingInProgress ?? null },
    { label: "Expedições Pendentes", value: dashStats?.shippingPending   ?? null },
    { label: "Total Processado",     value: dashStats?.totalProcessed    ?? null },
  ];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-black/40 backdrop-blur-sm border-b border-white/10 sticky top-0 z-10">
        <div className="container py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-4">
              <h1 className="text-2xl sm:text-3xl font-bold text-white drop-shadow">Med@x</h1>
              <span className="text-xs sm:text-sm text-white/70">WMS</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <span className="text-xs sm:text-sm text-white/80 hidden md:block">
                Bem-vindo, <span className="font-medium text-white">{user?.name || "Usuário"}</span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => logout()} className="h-9 text-white hover:text-white hover:bg-white/20 border border-white/30">
                Sair
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-6 sm:py-8">
        <div className="text-center mb-8 sm:mb-12">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white drop-shadow-lg mb-2 sm:mb-3 px-4">
            Sistema de Gerenciamento de Armazém
          </h2>
          <p className="text-sm sm:text-base lg:text-lg text-slate-200 drop-shadow px-4">
            Gerencie todas as operações do seu armazém de forma eficiente
          </p>
        </div>

        {/* Grid de Módulos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 mb-8 sm:mb-12">
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              <Card key={module.title} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3 sm:pb-6">
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className={`p-2 sm:p-3 rounded-lg ${module.bgColor} flex-shrink-0`}>
                      <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${module.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg sm:text-xl mb-1 sm:mb-2">{module.title}</CardTitle>
                      <CardDescription className="text-xs sm:text-sm">{module.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <ul className="space-y-1.5 sm:space-y-2 mb-3 sm:mb-4">
                    {module.features.map((feature, idx) => (
                      <li key={idx} className="text-xs sm:text-sm text-muted-foreground flex items-center gap-2">
                        <span className="text-primary">•</span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link href={module.href}>
                    <Button className="w-full h-10 sm:h-11 text-sm sm:text-base">Acessar Módulo</Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Estatísticas */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
                  {statsLoading ? (
                    <div className="flex justify-center py-1">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : (
                    <p className="text-3xl font-bold text-primary">{stat.value ?? 0}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
