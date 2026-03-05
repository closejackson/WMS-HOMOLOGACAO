import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Download, Printer, Star, Filter, BarChart3, Package, TruckIcon, Shield, ArrowLeft } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { exportToCSV, exportToExcel, exportToPDF } from "@/lib/reportExport";
import { StockByZoneChart } from "@/components/charts/StockByZoneChart";
import { TopProductsChart } from "@/components/charts/TopProductsChart";
import { MovementsTimelineChart } from "@/components/charts/MovementsTimelineChart";
import { OperatorProductivityChart } from "@/components/charts/OperatorProductivityChart";

type ReportCategory = 'stock' | 'operational' | 'shipping' | 'audit';

interface ReportDefinition {
  id: string;
  name: string;
  description: string;
  category: ReportCategory;
  icon: React.ReactNode;
}

const AVAILABLE_REPORTS: ReportDefinition[] = [
  // Relatórios de Estoque
  {
    id: 'stockPosition',
    name: 'Posição de Estoque',
    description: 'Visão detalhada do estoque por produto, lote, endereço e cliente',
    category: 'stock',
    icon: <Package className="h-4 w-4" />,
  },
  {
    id: 'stockByTenant',
    name: 'Estoque por Cliente',
    description: 'Totalização de estoque agrupado por cliente',
    category: 'stock',
    icon: <Package className="h-4 w-4" />,
  },
  {
    id: 'stockByLocation',
    name: 'Estoque por Endereço',
    description: 'Ocupação e utilização de endereços de armazenagem',
    category: 'stock',
    icon: <Package className="h-4 w-4" />,
  },
  {
    id: 'expiringProducts',
    name: 'Produtos Próximos ao Vencimento',
    description: 'Alerta de produtos com validade próxima (FEFO)',
    category: 'stock',
    icon: <Package className="h-4 w-4" />,
  },
  {
    id: 'productAvailability',
    name: 'Disponibilidade de Produtos',
    description: 'Análise de disponibilidade vs reservas',
    category: 'stock',
    icon: <Package className="h-4 w-4" />,
  },
  {
    id: 'inventoryMovements',
    name: 'Movimentações de Estoque',
    description: 'Histórico detalhado de movimentações',
    category: 'stock',
    icon: <Package className="h-4 w-4" />,
  },
  // Relatórios Operacionais
  {
    id: 'pickingProductivity',
    name: 'Produtividade de Separação',
    description: 'Itens separados por hora, por operador',
    category: 'operational',
    icon: <BarChart3 className="h-4 w-4" />,
  },
  {
    id: 'pickingAccuracy',
    name: 'Acuracidade de Picking',
    description: 'Taxa de acerto nas conferências (divergências vs total)',
    category: 'operational',
    icon: <BarChart3 className="h-4 w-4" />,
  },
  {
    id: 'averageCycleTime',
    name: 'Tempo Médio de Ciclo',
    description: 'Tempo entre criação e finalização de pedidos',
    category: 'operational',
    icon: <BarChart3 className="h-4 w-4" />,
  },
  {
    id: 'ordersByStatus',
    name: 'Pedidos por Status',
    description: 'Distribuição de pedidos por status',
    category: 'operational',
    icon: <BarChart3 className="h-4 w-4" />,
  },
  {
    id: 'operatorPerformance',
    name: 'Performance de Operadores',
    description: 'Métricas individuais de produtividade',
    category: 'operational',
    icon: <BarChart3 className="h-4 w-4" />,
  },
];

export default function Reports() {
  const [selectedCategory, setSelectedCategory] = useState<ReportCategory>('stock');
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [currentPage, setCurrentPage] = useState(1);

  // Filtrar relatórios por categoria
  const categoryReports = AVAILABLE_REPORTS.filter(r => r.category === selectedCategory);
  const currentReport = AVAILABLE_REPORTS.find(r => r.id === selectedReport);

  // Queries de todos os relatórios (sempre chamadas, mas habilitadas condicionalmente)
  const defaultDateFilters = {
    startDate: filters.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: filters.endDate || new Date().toISOString().split('T')[0],
  };

  const stockPositionQuery = trpc.reports.stockPosition.useQuery(
    { ...filters, page: currentPage },
    { enabled: selectedReport === 'stockPosition' }
  );
  const stockByTenantQuery = trpc.reports.stockByTenant.useQuery(
    { ...filters, page: currentPage },
    { enabled: selectedReport === 'stockByTenant' }
  );
  const stockByLocationQuery = trpc.reports.stockByLocation.useQuery(
    { ...filters, page: currentPage },
    { enabled: selectedReport === 'stockByLocation' }
  );
  const expiringProductsQuery = trpc.reports.expiringProducts.useQuery(
    { ...filters, page: currentPage },
    { enabled: selectedReport === 'expiringProducts' }
  );
  const productAvailabilityQuery = trpc.reports.productAvailability.useQuery(
    { ...filters, page: currentPage },
    { enabled: selectedReport === 'productAvailability' }
  );
  const inventoryMovementsQuery = trpc.reports.inventoryMovements.useQuery(
    { ...filters, ...defaultDateFilters, page: currentPage },
    { enabled: selectedReport === 'inventoryMovements' }
  );
  const pickingProductivityQuery = trpc.reports.pickingProductivity.useQuery(
    { ...filters, ...defaultDateFilters, page: currentPage },
    { enabled: selectedReport === 'pickingProductivity' }
  );
  const pickingAccuracyQuery = trpc.reports.pickingAccuracy.useQuery(
    { ...filters, ...defaultDateFilters, page: currentPage },
    { enabled: selectedReport === 'pickingAccuracy' }
  );
  const averageCycleTimeQuery = trpc.reports.averageCycleTime.useQuery(
    { ...filters, ...defaultDateFilters, page: currentPage },
    { enabled: selectedReport === 'averageCycleTime' }
  );
  const ordersByStatusQuery = trpc.reports.ordersByStatus.useQuery(
    { ...filters },
    { enabled: selectedReport === 'ordersByStatus' }
  );
  const operatorPerformanceQuery = trpc.reports.operatorPerformance.useQuery(
    { ...filters, ...defaultDateFilters, page: currentPage },
    { enabled: selectedReport === 'operatorPerformance' }
  );

  // Selecionar query ativa baseado no relatório selecionado
  const reportQuery = 
    selectedReport === 'stockPosition' ? stockPositionQuery :
    selectedReport === 'stockByTenant' ? stockByTenantQuery :
    selectedReport === 'stockByLocation' ? stockByLocationQuery :
    selectedReport === 'expiringProducts' ? expiringProductsQuery :
    selectedReport === 'productAvailability' ? productAvailabilityQuery :
    selectedReport === 'inventoryMovements' ? inventoryMovementsQuery :
    selectedReport === 'pickingProductivity' ? pickingProductivityQuery :
    selectedReport === 'pickingAccuracy' ? pickingAccuracyQuery :
    selectedReport === 'averageCycleTime' ? averageCycleTimeQuery :
    selectedReport === 'ordersByStatus' ? ordersByStatusQuery :
    selectedReport === 'operatorPerformance' ? operatorPerformanceQuery :
    { data: null, isLoading: false, error: null };

  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1); // Reset para primeira página ao mudar filtros
  };

  const handleGenerateReport = (reportId: string) => {
    setSelectedReport(reportId);
    setFilters({});
    setCurrentPage(1);
  };

  const handleExport = (format: 'excel' | 'pdf' | 'csv') => {
    if (!reportQuery.data?.data || reportQuery.data.data.length === 0) {
      alert('Nenhum dado para exportar');
      return;
    }

    const reportTitle = currentReport?.name || 'Relatório';
    const filename = selectedReport || 'relatorio';

    switch (format) {
      case 'csv':
        exportToCSV(reportQuery.data.data, filename);
        break;
      case 'excel':
        exportToExcel(reportQuery.data.data, filename, reportTitle);
        break;
      case 'pdf':
        exportToPDF(reportQuery.data.data, filename, reportTitle);
        break;
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.history.back()}
            className="flex items-center gap-2 text-white hover:text-white hover:bg-white/20"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-lg">Relatórios</h1>
            <p className="text-white/80 drop-shadow">
              Análises e relatórios gerenciais do WMS
            </p>
          </div>
        </div>
      </div>

      <Tabs value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as ReportCategory)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="stock" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Estoque
          </TabsTrigger>
          <TabsTrigger value="operational" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Operacionais
          </TabsTrigger>
          <TabsTrigger value="shipping" className="flex items-center gap-2">
            <TruckIcon className="h-4 w-4" />
            Expedição
          </TabsTrigger>
          <TabsTrigger value="audit" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Auditoria
          </TabsTrigger>
        </TabsList>

        <TabsContent value={selectedCategory} className="space-y-4">
          {!selectedReport ? (
            <>
              <Alert>
                <FileText className="h-4 w-4" />
                <AlertDescription>
                  Selecione um relatório abaixo para visualizar os dados
                </AlertDescription>
              </Alert>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {categoryReports.map((report) => (
                  <Card key={report.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => handleGenerateReport(report.id)}>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        {report.icon}
                        <CardTitle className="text-lg">{report.name}</CardTitle>
                      </div>
                      <CardDescription>{report.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button className="w-full" variant="outline">
                        <FileText className="mr-2 h-4 w-4" />
                        Gerar Relatório
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* Cabeçalho do Relatório */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{currentReport?.name}</CardTitle>
                      <CardDescription>{currentReport?.description}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setSelectedReport(null)}>
                        Voltar
                      </Button>
                      <Button variant="outline" size="sm" onClick={handlePrint}>
                        <Printer className="mr-2 h-4 w-4" />
                        Imprimir
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleExport('excel')}>
                        <Download className="mr-2 h-4 w-4" />
                        Excel
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              {/* Filtros Dinâmicos */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    Filtros
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-3">
                    {/* Filtros específicos por relatório */}
                    {selectedReport === 'inventoryMovements' && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="startDate">Data Inicial</Label>
                          <Input
                            id="startDate"
                            type="date"
                            value={filters.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                            onChange={(e) => handleFilterChange('startDate', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="endDate">Data Final</Label>
                          <Input
                            id="endDate"
                            type="date"
                            value={filters.endDate || new Date().toISOString().split('T')[0]}
                            onChange={(e) => handleFilterChange('endDate', e.target.value)}
                          />
                        </div>
                      </>
                    )}
                    
                    {selectedReport === 'expiringProducts' && (
                      <div className="space-y-2">
                        <Label htmlFor="daysUntilExpiry">Dias até Vencimento</Label>
                        <Input
                          id="daysUntilExpiry"
                          type="number"
                          placeholder="90"
                          value={filters.daysUntilExpiry || 90}
                          onChange={(e) => handleFilterChange('daysUntilExpiry', parseInt(e.target.value))}
                        />
                      </div>
                    )}

                    {selectedReport === 'stockByLocation' && (
                      <div className="space-y-2">
                        <Label htmlFor="locationType">Tipo de Endereço</Label>
                        <Select value={filters.locationType || 'all'} onValueChange={(v) => handleFilterChange('locationType', v === 'all' ? undefined : v)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Todos" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            <SelectItem value="whole">Inteiro</SelectItem>
                            <SelectItem value="fraction">Fração</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Gráficos Visuais */}
              {!reportQuery.isLoading && reportQuery.data?.data && reportQuery.data.data.length > 0 && (
                <div className="space-y-4">
                  {/* Gráficos de Estoque */}
                  {selectedReport === 'stockByLocation' && (
                    <StockByZoneChart data={reportQuery.data.data} />
                  )}
                  {selectedReport === 'stockPosition' && (
                    <TopProductsChart data={reportQuery.data.data} limit={10} />
                  )}
                  
                  {/* Gráficos Operacionais */}
                  {selectedReport === 'inventoryMovements' && (
                    <MovementsTimelineChart data={reportQuery.data.data} />
                  )}
                  {(selectedReport === 'pickingProductivity' || selectedReport === 'operatorPerformance') && (
                    <OperatorProductivityChart data={reportQuery.data.data} />
                  )}
                </div>
              )}

              {/* Tabela de Resultados */}
              <Card>
                <CardContent className="pt-6">
                  {reportQuery.isLoading ? (
                    <div className="text-center py-8">Carregando dados...</div>
                  ) : reportQuery.error ? (
                    <Alert variant="destructive">
                      <AlertDescription>
                        Erro ao carregar relatório: {reportQuery.error.message}
                      </AlertDescription>
                    </Alert>
                  ) : reportQuery.data?.data && reportQuery.data.data.length > 0 ? (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {Object.keys(reportQuery.data.data[0]).map((key) => (
                              <TableHead key={key}>{key}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reportQuery.data.data.map((row: any, idx: number) => (
                            <TableRow key={idx}>
                              {Object.values(row).map((value: any, cellIdx: number) => (
                                <TableCell key={cellIdx}>
                                  {value instanceof Date 
                                    ? value.toLocaleDateString('pt-BR') 
                                    : value?.toString() || '-'}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>

                      {/* Paginação */}
                      {'total' in reportQuery.data && reportQuery.data.total && (
                        <div className="flex items-center justify-between mt-4">
                          <div className="text-sm text-muted-foreground">
                            Mostrando {((currentPage - 1) * ('pageSize' in reportQuery.data ? reportQuery.data.pageSize : 50)) + 1} a{' '}
                            {Math.min(currentPage * ('pageSize' in reportQuery.data ? reportQuery.data.pageSize : 50), 'total' in reportQuery.data ? reportQuery.data.total : 0)} de{' '}
                            {'total' in reportQuery.data ? reportQuery.data.total : 0} registros
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={currentPage === 1}
                              onClick={() => setCurrentPage(p => p - 1)}
                            >
                              Anterior
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={currentPage * ('pageSize' in reportQuery.data ? reportQuery.data.pageSize : 50) >= ('total' in reportQuery.data ? reportQuery.data.total : 0)}
                              onClick={() => setCurrentPage(p => p + 1)}
                            >
                              Próxima
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      Nenhum dado encontrado para os filtros selecionados
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
