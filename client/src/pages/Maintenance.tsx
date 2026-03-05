import { useState } from "react";
import { useLocation } from "wouter";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Wrench,
  Trash2,
  RefreshCw,
  Search,
  AlertTriangle,
  CheckCircle2,
  FileUp,
  Database,
  ArrowRight,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

type OrphanItem = {
  id: number;
  reason: string;
  labelCode: string | null;
  uniqueCode: string | null;
  locationZone: string | null;
  tenantId: number | null;
  quantity: number;
  createdAt: Date;
};

type CleanPreviewRow = {
  key: string;
  label: string;
  recordCount: number;
};

type CleanResultRow = {
  key: string;
  label: string;
  deleted: number;
};

export default function Maintenance() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const isGlobalAdmin = user?.tenantId === 1;

  // ── Limpeza de Órfãos ──────────────────────────────────────────────────────
  const [orphans, setOrphans] = useState<OrphanItem[]>([]);
  const [lastScanResult, setLastScanResult] = useState<{
    orphansFound: number;
    dryRun: boolean;
    deletedCount: number;
    scannedAt: Date;
  } | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // ── Limpeza de Tabelas ─────────────────────────────────────────────────────
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [cleanPreview, setCleanPreview] = useState<CleanPreviewRow[] | null>(null);
  const [cleanResult, setCleanResult] = useState<CleanResultRow[] | null>(null);
  const [confirmCleanOpen, setConfirmCleanOpen] = useState(false);
  const [confirmPhrase, setConfirmPhrase] = useState("");

  // ── Mutations ──────────────────────────────────────────────────────────────
  const cleanupMut = trpc.maintenance.cleanupOrphanInventory.useMutation({
    onSuccess: (data) => {
      setOrphans(data.orphans as OrphanItem[]);
      setLastScanResult({
        orphansFound: data.orphansFound,
        dryRun: data.dryRun,
        deletedCount: data.deletedCount,
        scannedAt: new Date(),
      });
      if (data.dryRun) {
        if (data.orphansFound === 0) {
          toast.success("Nenhum órfão encontrado — o inventário está consistente.");
        } else {
          toast.warning(`${data.orphansFound} registro(s) órfão(s) encontrado(s). Revise a lista abaixo.`);
        }
      } else {
        toast.success(`Limpeza concluída: ${data.deletedCount} registro(s) removido(s)`);
        setOrphans([]);
      }
    },
    onError: (err) => toast.error(`Erro na limpeza: ${err.message}`),
  });

  const syncMut = trpc.maintenance.syncReservations.useMutation({
    onSuccess: (data) => toast.success(data.message),
    onError: (err) => toast.error(`Erro na sincronização: ${err.message}`),
  });

  const tableListQuery = trpc.maintenance.listCleanableTables.useQuery(undefined, {
    enabled: isGlobalAdmin,
  });

  const truncateMut = trpc.maintenance.truncateTables.useMutation({
    onSuccess: (data) => {
      if (data.dryRun) {
        setCleanPreview(data.tables as CleanPreviewRow[]);
        setConfirmCleanOpen(true);
      } else {
        setCleanResult(data.tables as CleanResultRow[]);
        setCleanPreview(null);
        setSelectedTables(new Set());
        setConfirmPhrase("");
        toast.success(`Limpeza concluída: ${data.deletedTotal} registro(s) removido(s) em ${data.tables.length} tabela(s)`);
      }
    },
    onError: (err) => toast.error(`Erro na limpeza: ${err.message}`),
  });

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleScan = () => cleanupMut.mutate({ dryRun: true });
  const handleCleanup = () => {
    setConfirmDeleteOpen(false);
    cleanupMut.mutate({ dryRun: false });
  };
  const handleSync = () => syncMut.mutate();

  const toggleTable = (key: string) => {
    setSelectedTables(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    const all = tableListQuery.data?.map(t => t.key) ?? [];
    if (selectedTables.size === all.length) {
      setSelectedTables(new Set());
    } else {
      setSelectedTables(new Set(all));
    }
  };

  const handleCleanPreview = () => {
    if (selectedTables.size === 0) {
      toast.error("Selecione ao menos uma tabela para limpar.");
      return;
    }
    truncateMut.mutate({ tables: Array.from(selectedTables), dryRun: true });
  };

  const handleConfirmClean = () => {
    if (confirmPhrase !== "CONFIRMAR LIMPEZA") {
      toast.error("Frase de confirmação incorreta.");
      return;
    }
    setConfirmCleanOpen(false);
    truncateMut.mutate({
      tables: Array.from(selectedTables),
      dryRun: false,
      confirmPhrase,
    });
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getZoneBadge = (zone: string | null) => {
    switch (zone) {
      case "NCG": return <Badge className="bg-yellow-500 text-red-700 border border-red-200">NCG</Badge>;
      case "REC": return <Badge className="bg-blue-500 hover:bg-blue-600">REC</Badge>;
      case "EXP": return <Badge className="bg-purple-500 hover:bg-purple-600">EXP</Badge>;
      default: return <Badge variant="outline">{zone ?? "—"}</Badge>;
    }
  };

  const allTableKeys = tableListQuery.data?.map(t => t.key) ?? [];
  const allSelected = allTableKeys.length > 0 && selectedTables.size === allTableKeys.length;
  const someSelected = selectedTables.size > 0 && !allSelected;

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={<Wrench className="h-8 w-8" />}
        title="Manutenção"
        description="Ferramentas de diagnóstico e limpeza do sistema"
      />

      <main className="container mx-auto px-6 py-8 space-y-6">

        {/* ── Card: Ações Rápidas ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Importar Saldos */}
          <Card
            className="cursor-pointer hover:border-primary/50 transition-colors group"
            onClick={() => setLocation("/inventory-import")}
          >
            <CardContent className="flex items-center gap-4 p-5">
              <div className="h-11 w-11 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                <FileUp className="h-5 w-5 text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">Importar Saldos</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Carga massiva de inventário via Excel
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            </CardContent>
          </Card>

          {/* Limpeza de Dados — âncora para o card abaixo */}
          <Card
            className={`transition-colors ${isGlobalAdmin ? "cursor-pointer hover:border-destructive/50 group" : "opacity-50 cursor-not-allowed"}`}
            onClick={() => {
              if (!isGlobalAdmin) return;
              document.getElementById("card-clean-tables")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <CardContent className="flex items-center gap-4 p-5">
              <div className="h-11 w-11 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                <Database className="h-5 w-5 text-destructive" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">Limpeza de Dados</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isGlobalAdmin ? "Truncar tabelas selecionadas do banco" : "Restrito ao Admin Global (tenantId: 1)"}
                </p>
              </div>
              {isGlobalAdmin && (
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-destructive transition-colors shrink-0" />
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Card: Limpeza de Tabelas (Global Admin only) ─────────────────── */}
        {isGlobalAdmin && (
          <Card id="card-clean-tables" className="border-destructive/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <Database className="h-5 w-5" />
                Limpeza de Dados — Admin Global
              </CardTitle>
              <CardDescription>
                Selecione as tabelas que deseja limpar. A operação executa um <strong>DELETE</strong> completo
                em cada tabela selecionada, respeitando a ordem de dependências FK.
                Esta ação é <strong>irreversível</strong> — use apenas em ambiente de homologação ou
                após backup confirmado.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {tableListQuery.isLoading && (
                <p className="text-sm text-muted-foreground">Carregando lista de tabelas...</p>
              )}

              {tableListQuery.data && (
                <>
                  {/* Seleção de tabelas */}
                  <div className="rounded-md border">
                    <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/30">
                      <Checkbox
                        id="select-all"
                        checked={allSelected}
                        data-state={someSelected ? "indeterminate" : allSelected ? "checked" : "unchecked"}
                        onCheckedChange={toggleAll}
                      />
                      <Label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                        {allSelected ? "Desmarcar todas" : "Selecionar todas"} ({allTableKeys.length} tabelas)
                      </Label>
                      {selectedTables.size > 0 && (
                        <Badge variant="destructive" className="ml-auto text-xs">
                          {selectedTables.size} selecionada(s)
                        </Badge>
                      )}
                    </div>
                    <ScrollArea className="h-64">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
                        {tableListQuery.data.map(table => (
                          <div
                            key={table.key}
                            className={`flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0 cursor-pointer hover:bg-muted/30 transition-colors ${
                              selectedTables.has(table.key) ? "bg-destructive/5" : ""
                            }`}
                            onClick={() => toggleTable(table.key)}
                          >
                            <Checkbox
                              checked={selectedTables.has(table.key)}
                              onCheckedChange={() => toggleTable(table.key)}
                            />
                            <span className="text-sm">{table.label}</span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>

                  {/* Resultado da prévia */}
                  {cleanPreview && (
                    <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-2">
                      <p className="text-sm font-medium text-yellow-600 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        Prévia — registros que serão removidos:
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {cleanPreview.map(row => (
                          <div key={row.key} className="text-xs flex justify-between gap-2 bg-background/50 rounded px-2 py-1 border">
                            <span className="truncate text-muted-foreground">{row.label}</span>
                            <span className="font-mono font-semibold shrink-0">{row.recordCount.toLocaleString("pt-BR")}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Total: <strong>{cleanPreview.reduce((a, r) => a + r.recordCount, 0).toLocaleString("pt-BR")}</strong> registros
                      </p>
                    </div>
                  )}

                  {/* Resultado da limpeza */}
                  {cleanResult && (
                    <div className="rounded-md border border-green-500/30 bg-green-500/5 p-3 space-y-2">
                      <p className="text-sm font-medium text-green-600 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        Limpeza concluída com sucesso
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {cleanResult.map(row => (
                          <div key={row.key} className="text-xs flex justify-between gap-2 bg-background/50 rounded px-2 py-1 border">
                            <span className="truncate text-muted-foreground">{row.label}</span>
                            <span className="font-mono font-semibold shrink-0 text-destructive">{row.deleted.toLocaleString("pt-BR")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Botão de ação */}
                  <div className="flex gap-3 pt-1">
                    <Button
                      variant="destructive"
                      onClick={handleCleanPreview}
                      disabled={selectedTables.size === 0 || truncateMut.isPending}
                      className="gap-2"
                    >
                      {truncateMut.isPending ? (
                        <><RefreshCw className="h-4 w-4 animate-spin" />Processando...</>
                      ) : (
                        <><Trash2 className="h-4 w-4" />Limpar {selectedTables.size > 0 ? `${selectedTables.size} tabela(s)` : "tabelas selecionadas"}</>
                      )}
                    </Button>
                    {(cleanPreview || cleanResult) && (
                      <Button
                        variant="outline"
                        onClick={() => { setCleanPreview(null); setCleanResult(null); }}
                        className="gap-2"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Limpar resultado
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Card: Limpeza de Órfãos ─────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Limpeza de Registros Órfãos
            </CardTitle>
            <CardDescription>
              Identifica e remove registros de inventário inconsistentes: NCG sem não-conformidade
              correspondente, REC com quantidade zero, e registros com endereço ou produto inexistente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {lastScanResult && (
              <div className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${
                lastScanResult.orphansFound === 0
                  ? "border-green-500/30 bg-green-500/10 text-green-400"
                  : "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
              }`}>
                {lastScanResult.orphansFound === 0
                  ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                  : <AlertTriangle className="h-4 w-4 shrink-0" />}
                <span>
                  {lastScanResult.dryRun
                    ? `Varredura em ${lastScanResult.scannedAt.toLocaleTimeString("pt-BR")}: ${lastScanResult.orphansFound} órfão(s) encontrado(s)`
                    : `Limpeza em ${lastScanResult.scannedAt.toLocaleTimeString("pt-BR")}: ${lastScanResult.deletedCount} registro(s) removido(s)`}
                </span>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={handleScan}
                disabled={cleanupMut.isPending}
                className="gap-2"
              >
                <Search className="h-4 w-4" />
                {cleanupMut.isPending && !confirmDeleteOpen ? "Verificando..." : "Verificar Órfãos"}
              </Button>

              {orphans.length > 0 && (
                <Button
                  variant="destructive"
                  onClick={() => setConfirmDeleteOpen(true)}
                  disabled={cleanupMut.isPending}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir {orphans.length} Registro(s) Órfão(s)
                </Button>
              )}
            </div>

            {orphans.length > 0 && (
              <div className="rounded-md border overflow-auto max-h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Zona</TableHead>
                      <TableHead>Label Code</TableHead>
                      <TableHead>Unique Code</TableHead>
                      <TableHead>Qtd</TableHead>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Criado em</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orphans.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs">{item.id}</TableCell>
                        <TableCell>{getZoneBadge(item.locationZone)}</TableCell>
                        <TableCell className="font-mono text-xs">{item.labelCode ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{item.uniqueCode ?? "—"}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{item.tenantId ?? "—"}</TableCell>
                        <TableCell className="text-xs">
                          {new Date(item.createdAt).toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs truncate" title={item.reason}>
                          {item.reason}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {lastScanResult && orphans.length === 0 && lastScanResult.orphansFound === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum registro órfão encontrado. O inventário está consistente.
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Card: Sincronização de Reservas ─────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-blue-400" />
              Sincronização de Reservas
            </CardTitle>
            <CardDescription>
              Recalcula o campo <code>reservedQuantity</code> em todos os registros de estoque com
              base nos pedidos de separação ativos. Corrige divergências causadas por falhas de
              transação ou cancelamentos sem rollback.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={handleSync}
              disabled={syncMut.isPending}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${syncMut.isPending ? "animate-spin" : ""}`} />
              {syncMut.isPending ? "Sincronizando..." : "Sincronizar Reservas"}
            </Button>
          </CardContent>
        </Card>

      </main>

      {/* ── Diálogo: confirmar exclusão de órfãos ─────────────────────────── */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão de {orphans.length} registro(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é <strong>irreversível</strong>. Os registros órfãos serão permanentemente
              excluídos da tabela de inventário. Certifique-se de que a lista foi revisada antes de
              prosseguir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCleanup}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir Registros
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Diálogo: confirmar limpeza de tabelas ─────────────────────────── */}
      <AlertDialog open={confirmCleanOpen} onOpenChange={setConfirmCleanOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Confirmar Limpeza de {selectedTables.size} Tabela(s)
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Esta operação irá remover <strong>permanentemente</strong> todos os registros das
                  tabelas selecionadas. O total estimado é de{" "}
                  <strong>{cleanPreview?.reduce((a, r) => a + r.recordCount, 0).toLocaleString("pt-BR") ?? 0} registros</strong>.
                </p>
                <p className="text-sm">
                  Para confirmar, digite exatamente: <code className="bg-muted px-1 rounded font-mono">CONFIRMAR LIMPEZA</code>
                </p>
                <Input
                  value={confirmPhrase}
                  onChange={(e) => setConfirmPhrase(e.target.value)}
                  placeholder="CONFIRMAR LIMPEZA"
                  className="font-mono"
                  autoFocus
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmPhrase("")}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmClean}
              disabled={confirmPhrase !== "CONFIRMAR LIMPEZA"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              Executar Limpeza
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
