import { CollectorLayout } from "../../components/CollectorLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Package, Scan, TruckIcon, ArrowLeftRight, Printer } from "lucide-react";
import { Link } from "wouter";
import { Button } from "../../components/ui/button";

export function CollectorHome() {
  const operations = [
    {
      title: "Recebimento",
      description: "Conferência cega de mercadorias",
      icon: Package,
      path: "/collector/receiving",
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Picking",
      description: "Separação de pedidos",
      icon: Scan,
      path: "/collector/picking",
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      title: "Stage",
      description: "Conferência de expedição",
      icon: TruckIcon,
      path: "/collector/stage",
      color: "text-orange-600",
      bgColor: "bg-orange-50",
    },
    {
      title: "Movimentação",
      description: "Transferência entre endereços",
      icon: ArrowLeftRight,
      path: "/collector/movement",
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
    {
      title: "Reimpressão de Etiquetas",
      description: "Reimprima etiquetas de qualquer tipo",
      icon: Printer,
      path: "/collector/label-reprint",
      color: "text-teal-600",
      bgColor: "bg-teal-50",
    },
  ];

  return (
    <CollectorLayout title="Coletor de Dados">
      <div className="space-y-4">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-white drop-shadow-lg">Selecione uma Operação</h2>
          <p className="text-slate-200 drop-shadow">
            Escolha a operação que deseja realizar
          </p>
        </div>

        <div className="grid gap-4">
          {operations.map((op) => {
            const Icon = op.icon;
            return (
              <Link key={op.path} href={op.path}>
                <Card className="cursor-pointer hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-lg ${op.bgColor}`}>
                        <Icon className={`h-8 w-8 ${op.color}`} />
                      </div>
                      <div className="flex-1">
                        <CardTitle className="text-xl">{op.title}</CardTitle>
                        <CardDescription className="text-base mt-1">
                          {op.description}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-sm">Atalhos Rápidos</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <Link href="/stock">
              <Button variant="outline" className="w-full h-12 border-slate-600 bg-slate-800/80 text-white hover:bg-slate-700 hover:text-white">
                Ver Estoque
              </Button>
            </Link>
            <Link href="/">
              <Button variant="outline" className="w-full h-12 border-slate-600 bg-slate-800/80 text-white hover:bg-slate-700 hover:text-white">
                Menu Principal
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </CollectorLayout>
  );
}
