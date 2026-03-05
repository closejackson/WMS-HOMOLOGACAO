import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Package, Boxes, MapPin, AlertCircle, Download, RefreshCw, ArrowRightLeft, BarChart3, Tag } from "lucide-react";
import { Link } from "wouter";
import { PageHeader } from "@/components/PageHeader";
import { format } from "date-fns";

export default function StockPositions() {
  const [searchTerm, setSearchTerm] = useState("");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  
  // Debug: log quando statusFilter mudar
  useEffect(() => {
    console.log("[FRONTEND DEBUG] statusFilter changed:", statusFilter);
  }, [statusFilter]);
  const [batchFilter, setBatchFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");

  // Queries
  const statusParam = statusFilter.length === 0 ? undefined : (statusFilter.length === 1 ? statusFilter[0] : statusFilter);
  
  useEffect(() => {
    console.log("[FRONTEND DEBUG] statusParam being sent:", statusParam, "type:", typeof statusParam, "isArray:", Array.isArray(statusParam));
  }, [statusParam]);
  
  const { data: positions = [], isLoading, refetch } = trpc.stock.getPositions.useQuery({
    tenantId: clientFilter === "all" ? undefined : clientFilter === "shared" ? null : Number(clientFilter),
    search: searchTerm || undefined,
    zoneId: zoneFilter === "all" ? undefined : Number(zoneFilter),
    status: statusFilter.length === 0 ? undefined : (statusFilter.length === 1 ? statusFilter[0] : statusFilter) as any,
    batch: batchFilter || undefined,
    locationCode: locationFilter || undefined,
  });

  const { data: summary } = trpc.stock.getSummary.useQuery({
    tenantId: clientFilter === "all" ? undefined : clientFilter === "shared" ? null : Number(clientFilter),
    search: searchTerm || undefined,
    zoneId: zoneFilter === "all" ? undefined : Number(zoneFilter),
    status: statusFilter.length === 0 ? undefined : (statusFilter.length === 1 ? statusFilter[0] : statusFilter) as any,
    batch: batchFilter || undefined,
    locationCode: locationFilter || undefined,
  });

  const { data: tenants = [] } = trpc.tenants.list.useQuery();
  const { data: zones = [] } = trpc.zones.list.useQuery();

  // Função para obter nome do cliente dono do endereço
  const getLocationTenantName = (locationTenantId: number | null) => {
    if (!locationTenantId) return "Compartilhado";
    const tenant = tenants.find(t => t.id === locationTenantId);
    return tenant?.name || "Compartilhado";
  };

  // Status badge
  const getLocationStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      livre: { label: "Livre", className: "border-gray-300 text-gray-600" },
      available: { label: "Disponível", className: "bg-green-100 text-green-800 border-green-300" },
      occupied: { label: "Ocupado", className: "bg-blue-100 text-blue-800 border-blue-300" },
      blocked: { label: "Bloqueado", className: "bg-red-100 text-red-800 border-red-300" },
      quarantine: { label: "Quarentena", className: "bg-yellow-100 text-red-700 border-yellow-400 font-semibold" },
      counting: { label: "Em Contagem", className: "bg-yellow-100 text-yellow-800 border-yellow-300" },
    };
    const config = statusConfig[status] || statusConfig.livre;
    return <Badge variant="outline" className={config.className}>{config.label}</Badge>;
  };

  // Limpar filtros
  const handleClearFilters = () => {
    setSearchTerm("");
    setClientFilter("all");
    setZoneFilter("all");
    setStatusFilter([]);
    setBatchFilter("");
    setLocationFilter("");
  };

  // Mutation para exportar Excel
  const exportMutation = trpc.stock.exportToExcel.useMutation({
    onSuccess: (result) => {
      // Converter base64 para blob e fazer download
      const blob = new Blob(
        [Uint8Array.from(atob(result.data), c => c.charCodeAt(0))],
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Arquivo Excel exportado com sucesso!');
    },
    onError: (error) => {
      toast.error(`Erro ao exportar: ${error.message}`);
    },
  });

  // Exportar para Excel
  const handleExportExcel = () => {
    exportMutation.mutate({
      tenantId: clientFilter === "all" ? undefined : clientFilter === "shared" ? null : Number(clientFilter),
      search: searchTerm || undefined,
      zoneId: zoneFilter === "all" ? undefined : Number(zoneFilter),
      status: statusFilter.length === 0 ? undefined : (statusFilter.length === 1 ? statusFilter[0] : statusFilter) as any,
      batch: batchFilter || undefined,
      locationCode: locationFilter || undefined,
    });
  };

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={<Package className="h-8 w-8" />}
        title="Posições de Estoque"
        description="Consulte o estoque disponível em tempo real"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/stock/occupancy">
              <Button variant="outline" size="sm" className="bg-white text-gray-700 hover:bg-gray-50">
                <BarChart3 className="w-4 h-4 mr-2" /> Dashboard de Ocupação
              </Button>
            </Link>
            <Button variant="outline" size="sm" className="bg-white text-gray-700 hover:bg-gray-50" onClick={() => toast.info("Funcionalidade em desenvolvimento")}>
              <Tag className="w-4 h-4 mr-2" /> Histórico de Etiquetas
            </Button>
            <Link href="/stock/movements">
              <Button variant="outline" size="sm" className="bg-white text-gray-700 hover:bg-gray-50">
                <ArrowRightLeft className="w-4 h-4 mr-2" /> Movimentações
              </Button>
            </Link>
            <Button variant="default" size="sm" onClick={handleExportExcel}>
              <Download className="w-4 h-4 mr-2" /> Exportar Excel
            </Button>
          </div>
        }
      />

      <div className="container py-8">
        {/* Cards de Resumo */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Package className="w-4 h-4" /> Total de Posições
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.totalPositions || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Boxes className="w-4 h-4" /> Quantidade Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.totalQuantity?.toLocaleString("pt-BR") || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <MapPin className="w-4 h-4" /> Endereços Ocupados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.uniqueLocations || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Lotes Únicos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.uniqueBatches || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Legenda de Status */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-sm">Legenda de Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-gray-300 text-gray-600">Livre</Badge>
                <span className="text-sm text-muted-foreground">Endereço vazio</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">Disponível</Badge>
                <span className="text-sm text-muted-foreground">Endereço com estoque, aceita mais</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300">Ocupado</Badge>
                <span className="text-sm text-muted-foreground">Endereço com estoque, não aceita mais</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">Bloqueado</Badge>
                <span className="text-sm text-muted-foreground">Endereço bloqueado</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300">Em Contagem</Badge>
                <span className="text-sm text-muted-foreground">Inventário em andamento</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filtros */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-sm">Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                placeholder="Buscar por SKU, descrição..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-white"
              />

              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Cliente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Clientes</SelectItem>
                  <SelectItem value="shared">Compartilhado</SelectItem>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={zoneFilter} onValueChange={setZoneFilter}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Zona" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Zonas</SelectItem>
                  {zones.map((z) => (
                    <SelectItem key={z.id} value={String(z.id)}>
                      {z.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <MultiSelect
                options={[
                  { value: "livre", label: "Livre" },
                  { value: "available", label: "Disponível" },
                  { value: "occupied", label: "Ocupado" },
                  { value: "blocked", label: "Bloqueado" },
                  { value: "quarantine", label: "Quarentena" },
                  { value: "counting", label: "Em Contagem" },
                ]}
                selected={statusFilter}
                onChange={setStatusFilter}
                placeholder="Todos os status"
                className="bg-white"
              />

              <Input
                placeholder="Filtrar por lote..."
                value={batchFilter}
                onChange={(e) => setBatchFilter(e.target.value)}
                className="bg-white"
              />

              <Input
                placeholder="Filtrar por endereço..."
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="bg-white"
              />

              <div className="flex gap-2">
                <Button variant="outline" className="bg-white text-gray-700 hover:bg-gray-50" onClick={handleClearFilters}>
                  Limpar Filtros
                </Button>
                <Button onClick={handleExportExcel} disabled={positions.length === 0 || exportMutation.isPending}>
                  <Download className="w-4 h-4 mr-2" /> 
                  {exportMutation.isPending ? 'Exportando...' : 'Exportar Excel'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabela */}
        <Card>
          <CardHeader>
            <CardTitle>Posições de Estoque</CardTitle>
            <CardDescription>{positions.length} posição(ões) encontrada(s)</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Carregando...</div>
            ) : positions.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>Nenhuma posição de estoque encontrada</AlertDescription>
              </Alert>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-white">
                      <TableHead className="text-gray-700 font-semibold">Cliente</TableHead>
                      <TableHead className="text-gray-700 font-semibold">Zona</TableHead>
                      <TableHead className="text-gray-700 font-semibold">Endereço</TableHead>
                      <TableHead className="text-gray-700 font-semibold">Status</TableHead>
                      <TableHead className="text-gray-700 font-semibold">SKU</TableHead>
                      <TableHead className="text-gray-700 font-semibold">Produto</TableHead>
                      <TableHead className="text-gray-700 font-semibold">Lote</TableHead>
                      <TableHead className="text-right text-gray-700 font-semibold">Quantidade</TableHead>
                      <TableHead className="text-right text-gray-700 font-semibold">Qtd. Reservada</TableHead>
                      <TableHead className="text-right text-gray-700 font-semibold">Qtd. Disponível</TableHead>
                      <TableHead className="text-gray-700 font-semibold">Validade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {positions.map((pos, idx) => (
                      <TableRow key={pos.id ? `${pos.id}-${pos.batch}-${pos.locationId}` : `empty-${pos.locationId}-${idx}`}>
                        <TableCell>{getLocationTenantName(pos.locationTenantId)}</TableCell>
                        <TableCell>{pos.zoneName}</TableCell>
                        <TableCell className="font-mono">{pos.locationCode}</TableCell>
                        <TableCell>{getLocationStatusBadge(pos.locationStatus)}</TableCell>
                        <TableCell className="font-mono">{pos.productSku || "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{pos.productDescription || "Endereço vazio"}</TableCell>
                        <TableCell className="font-mono">{pos.batch || "-"}</TableCell>
                        <TableCell className="text-right font-bold">
                          {pos.quantity ? pos.quantity.toLocaleString("pt-BR") : "-"}
                        </TableCell>
                        <TableCell className="text-right text-orange-600 font-semibold">
                          {pos.reservedQuantity && pos.reservedQuantity > 0 ? pos.reservedQuantity.toLocaleString("pt-BR") : "-"}
                        </TableCell>
                        <TableCell className="text-right text-green-600 font-semibold">
                          {pos.quantity ? (pos.quantity - (pos.reservedQuantity || 0)).toLocaleString("pt-BR") : "-"}
                        </TableCell>
                        <TableCell>
                          {pos.expiryDate ? format(new Date(pos.expiryDate), "dd/MM/yyyy") : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
