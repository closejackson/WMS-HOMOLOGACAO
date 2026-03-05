import React from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { BarChart3, TrendingUp, AlertTriangle, CheckCircle2, Lightbulb } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

export default function OccupancyDashboard() {
  // Queries
  const { data: overall, isLoading: loadingOverall } = trpc.stock.getOverallOccupancy.useQuery();
  const { data: zoneOccupancy = [], isLoading: loadingZones } = trpc.stock.getOccupancyByZone.useQuery();
  const { data: suggestions = [], isLoading: loadingSuggestions } = trpc.stock.getOptimizationSuggestions.useQuery();

  // Badge de prioridade
  const getPriorityBadge = (priority: string) => {
    const priorityConfig: Record<string, { label: string; className: string }> = {
      high: { label: "Alta", className: "bg-red-100 text-red-800 border-red-300" },
      medium: { label: "Média", className: "bg-yellow-100 text-yellow-800 border-yellow-300" },
      low: { label: "Baixa", className: "bg-blue-100 text-blue-800 border-blue-300" },
    };
    const config = priorityConfig[priority] || priorityConfig.medium;
    return <Badge variant="outline" className={config.className}>{config.label}</Badge>;
  };

  // Ícone de tipo de sugestão
  const getSuggestionIcon = (type: string) => {
    const icons: Record<string, React.ReactNode> = {
      consolidation: <TrendingUp className="w-5 h-5 text-blue-600" />,
      capacity_critical: <AlertTriangle className="w-5 h-5 text-red-600" />,
      reallocation: <BarChart3 className="w-5 h-5 text-yellow-600" />,
      efficiency: <Lightbulb className="w-5 h-5 text-green-600" />,
    };
    return icons[type] || icons.efficiency;
  };

  // Cor da barra de progresso baseada na ocupação
  const getOccupancyColor = (percentage: number) => {
    if (percentage < 40) return "bg-blue-500";
    if (percentage < 70) return "bg-green-500";
    if (percentage < 85) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={<BarChart3 className="h-8 w-8" />}
        title="Dashboard de Ocupação"
        description="Visualize a ocupação do armazém e receba sugestões de otimização"
      />

      <div className="container py-8 space-y-8">
        {/* Ocupação Geral */}
        <Card>
          <CardHeader>
            <CardTitle>Ocupação Geral do Armazém</CardTitle>
            <CardDescription>Visão consolidada de todos os endereços</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingOverall ? (
              <div className="text-center py-8">Carregando...</div>
            ) : overall ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Total de Endereços</p>
                    <p className="text-3xl font-bold">{overall.total}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Ocupados</p>
                    <p className="text-3xl font-bold text-blue-600">{overall.occupied}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Disponíveis</p>
                    <p className="text-3xl font-bold text-green-600">{overall.available}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Bloqueados</p>
                    <p className="text-3xl font-bold text-red-600">{overall.blocked}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-medium">Taxa de Ocupação</p>
                    <p className="text-2xl font-bold">{overall.occupancyPercentage.toFixed(1)}%</p>
                  </div>
                  <Progress 
                    value={overall.occupancyPercentage} 
                    className="h-4"
                  />
                  <p className="text-xs text-muted-foreground">
                    {overall.occupancyPercentage < 40 && "Baixa utilização - Considere consolidação"}
                    {overall.occupancyPercentage >= 40 && overall.occupancyPercentage < 70 && "Ocupação adequada"}
                    {overall.occupancyPercentage >= 70 && overall.occupancyPercentage < 85 && "Boa utilização"}
                    {overall.occupancyPercentage >= 85 && "Atenção: Capacidade crítica"}
                  </p>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Ocupação por Zona */}
        <Card>
          <CardHeader>
            <CardTitle>Ocupação por Zona</CardTitle>
            <CardDescription>Distribuição de ocupação em cada zona do armazém</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingZones ? (
              <div className="text-center py-8">Carregando...</div>
            ) : zoneOccupancy.length === 0 ? (
              <Alert>
                <AlertDescription>Nenhuma zona cadastrada</AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-6">
                {zoneOccupancy.map((zone) => (
                  <div key={zone.zoneId} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium">{zone.zoneName}</p>
                        <p className="text-sm text-muted-foreground">
                          {zone.occupied} de {zone.total} endereços ocupados
                        </p>
                      </div>
                      <p className="text-xl font-bold">{zone.occupancyPercentage.toFixed(1)}%</p>
                    </div>
                    <Progress 
                      value={zone.occupancyPercentage} 
                      className={`h-3 [&>div]:${getOccupancyColor(zone.occupancyPercentage)}`}
                    />
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>Disponíveis: {zone.available}</span>
                      <span>Bloqueados: {zone.blocked}</span>
                      <span>Em Contagem: {zone.counting}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sugestões de Otimização */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5" /> Sugestões de Otimização
            </CardTitle>
            <CardDescription>
              Recomendações baseadas em análise de padrões de ocupação
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingSuggestions ? (
              <div className="text-center py-8">Carregando...</div>
            ) : suggestions.length === 0 ? (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Tudo certo!</AlertTitle>
                <AlertDescription>
                  Não há sugestões de otimização no momento. O armazém está operando de forma eficiente.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-4">
                {suggestions.map((suggestion) => (
                  <Card key={suggestion.id} className="border-l-4 border-l-primary">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          {getSuggestionIcon(suggestion.type)}
                          <div>
                            <CardTitle className="text-base">{suggestion.title}</CardTitle>
                            <CardDescription className="mt-1">{suggestion.description}</CardDescription>
                          </div>
                        </div>
                        {getPriorityBadge(suggestion.priority)}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-sm font-medium mb-2">Impacto Esperado:</p>
                        <p className="text-sm text-muted-foreground">{suggestion.impact}</p>
                      </div>

                      <div>
                        <p className="text-sm font-medium mb-2">Métricas:</p>
                        <div className="flex items-center gap-4 text-sm">
                          <span>Atual: <strong>{suggestion.metrics.current} {suggestion.metrics.unit}</strong></span>
                          <span className="text-muted-foreground">→</span>
                          <span className="text-green-600">Meta: <strong>{suggestion.metrics.target} {suggestion.metrics.unit}</strong></span>
                        </div>
                      </div>

                      <div>
                        <p className="text-sm font-medium mb-2">Ações Recomendadas:</p>
                        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                          {suggestion.actions.map((action, idx) => (
                            <li key={idx}>{action}</li>
                          ))}
                        </ul>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
