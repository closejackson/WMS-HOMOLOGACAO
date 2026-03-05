import React, { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Upload, FileSpreadsheet, Download, CheckCircle2, XCircle, RefreshCw, AlertCircle } from "lucide-react";

// Mapeamento de colunas da planilha → campos do sistema
const COLUMN_MAP: Record<string, string> = {
  // SKU
  "sku": "sku",
  "sku *": "sku",
  "código": "sku",
  "codigo": "sku",
  "cod.": "sku",
  // Descrição
  "description": "description",
  "descrição": "description",
  "descrição *": "description",
  "descricao": "description",
  "nome": "description",
  // Categoria
  "category": "category",
  "categoria": "category",
  // GTIN
  "gtin": "gtin",
  "gtin / ean": "gtin",
  "ean": "gtin",
  "código de barras": "gtin",
  "codigo de barras": "gtin",
  // Registro ANVISA
  "registro anvisa": "anvisaRegistry",
  "anvisaregistry": "anvisaRegistry",
  "anvisa": "anvisaRegistry",
  // Classe Terapêutica
  "classe terapêutica": "therapeuticClass",
  "classe terapeutica": "therapeuticClass",
  "therapeuticclass": "therapeuticClass",
  // Fabricante
  "fabricante": "manufacturer",
  "manufacturer": "manufacturer",
  // Unidade de Medida
  "unidade": "unitOfMeasure",
  "unidade de medida": "unitOfMeasure",
  "unitmeasure": "unitOfMeasure",
  "unitsofmeasure": "unitOfMeasure",
  "unidademedida": "unitOfMeasure",
  // Qtd por Caixa
  "qtd por caixa": "unitsPerBox",
  "qtd por caixa *": "unitsPerBox",
  "quantidade por caixa": "unitsPerBox",
  "unitsperbox": "unitsPerBox",
  // Qtd Mínima
  "qtd mínima": "minQuantity",
  "qtd minima": "minQuantity",
  "quantidade mínima": "minQuantity",
  "quantidade minima": "minQuantity",
  "minquantity": "minQuantity",
  // Qtd Dispensação
  "qtd dispensação": "dispensingQuantity",
  "quantidade dispensação": "dispensingQuantity",
  "dispensingquantity": "dispensingQuantity",
  // Armazenagem
  "armazenagem": "storageCondition",
  "condição armazenagem": "storageCondition",
  "storagecondition": "storageCondition",
  // Controle Lote
  "controle lote": "requiresBatchControl",
  "controle lote *": "requiresBatchControl",
  "requiresbatchcontrol": "requiresBatchControl",
  // Controle Validade
  "controle validade": "requiresExpiryControl",
  "requiresexpirycontrol": "requiresExpiryControl",
};

type ParsedRow = {
  sku: string;
  description: string;
  category?: string;
  gtin?: string;
  anvisaRegistry?: string;
  therapeuticClass?: string;
  manufacturer?: string;
  unitOfMeasure?: string;
  unitsPerBox?: number;
  minQuantity?: number;
  dispensingQuantity?: number;
  storageCondition?: string;
  requiresBatchControl?: boolean;
  requiresExpiryControl?: boolean;
};

type ImportResult = {
  row: number;
  sku: string;
  status: "inserted" | "updated" | "error";
  error?: string;
};

function normalizeKey(key: string): string {
  return key.toLowerCase().trim().replace(/\s+/g, " ");
}

function parseRows(sheet: XLSX.WorkSheet): ParsedRow[] {
  const raw = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
  return raw
    .map((rawRow) => {
      const mapped: Record<string, any> = {};
      for (const [k, v] of Object.entries(rawRow)) {
        const field = COLUMN_MAP[normalizeKey(k)];
        if (field) {
          if (field === "unitsPerBox" || field === "minQuantity" || field === "dispensingQuantity") {
            const n = Number(v);
            mapped[field] = isNaN(n) || String(v).trim() === "" ? undefined : n;
          } else if (field === "requiresBatchControl" || field === "requiresExpiryControl") {
            const s = String(v).toLowerCase().trim();
            // Aceita: sim, s, true, 1, yes, y  |  nao, não, false, 0, no, n
            if (s === "" || s.startsWith("obrigat") || s.startsWith("preenchido")) {
              // linha de instruções — ignorar
              mapped[field] = undefined;
            } else {
              mapped[field] = s === "true" || s === "sim" || s === "s" || s === "1" || s === "yes" || s === "y";
            }
          } else {
            const sv = String(v).trim();
            // Ignorar células de instrução (começam com "OBRIGATÓRIO", "Padrão:", "Ex:")
            if (sv.startsWith("OBRIGAT") || sv.startsWith("Padrão") || sv.startsWith("Ex:") || sv.startsWith("Preenchido")) {
              mapped[field] = undefined;
            } else {
              mapped[field] = sv || undefined;
            }
          }
        }
      }
      return mapped as ParsedRow;
    })
    .filter((r) => {
      // Ignorar linhas completamente vazias e a linha de instruções do template
      if (!r.sku && !r.description) return false;
      // Ignorar linha de instruções: SKU começa com "OBRIGATÓRIO" ou "Ex:"
      const skuStr = String(r.sku ?? "");
      if (skuStr.startsWith("OBRIGAT") || skuStr.startsWith("Ex:")) return false;
      return true;
    });
}

function downloadTemplate() {
  // Cabeçalhos em português (* = obrigatório)
  const headers = [
    "SKU *",
    "Descrição *",
    "Categoria",
    "GTIN / EAN",
    "Registro ANVISA",
    "Classe Terapêutica",
    "Fabricante",
    "Unidade de Medida",
    "Qtd por Caixa *",
    "Qtd Mínima",
    "Qtd Dispensação",
    "Armazenagem",
    "Controle Lote *",
    "Controle Validade",
  ];

  // Linha de instruções (linha 2)
  const instructions = [
    "OBRIGATÓRIO. Ex: MED001",
    "OBRIGATÓRIO. Ex: Paracetamol 500mg",
    "Padrão: Medicamento",
    "Padrão: vazio",
    "Padrão: vazio",
    "Padrão: Medicamentos e Insumos",
    "Padrão: vazio",
    "Padrão: UN. Ex: CX, FR, AMP",
    "OBRIGATÓRIO. Número inteiro > 0. Ex: 24",
    "Padrão: 0",
    "Padrão: 1",
    "Padrão: Ambiente. Outros: Refrigerado, Congelado, Controlado",
    "OBRIGATÓRIO. Digite: sim ou nao",
    "Preenchido automaticamente igual ao Controle Lote",
  ];

  // Linha de exemplo preenchida (linha 3)
  const example = [
    "MED001",
    "Paracetamol 500mg",
    "",
    "",
    "",
    "",
    "",
    "",
    24,
    "",
    "",
    "",
    "sim",
    "",
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, instructions, example]);

  // Largura das colunas
  ws["!cols"] = [
    { wch: 14 }, // SKU
    { wch: 30 }, // Descrição
    { wch: 18 }, // Categoria
    { wch: 18 }, // GTIN
    { wch: 22 }, // Registro ANVISA
    { wch: 28 }, // Classe Terapêutica
    { wch: 20 }, // Fabricante
    { wch: 18 }, // Unidade
    { wch: 14 }, // Qtd Caixa
    { wch: 12 }, // Qtd Mínima
    { wch: 16 }, // Qtd Dispensação
    { wch: 42 }, // Armazenagem
    { wch: 14 }, // Controle Lote
    { wch: 16 }, // Controle Validade
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Produtos");
  XLSX.writeFile(wb, "modelo_importacao_produtos.xlsx");
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenants: { id: number; name: string }[];
  defaultTenantId?: number;
  onSuccess?: () => void;
}

export function ImportProductsDialog({ open, onOpenChange, tenants, defaultTenantId, onSuccess }: Props) {
  const [tenantId, setTenantId] = useState<number | undefined>(defaultTenantId);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [importResults, setImportResults] = useState<{ inserted: number; updated: number; errors: number; results: ImportResult[] } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const importMutation = trpc.products.importFromExcel.useMutation({
    onSuccess: (data) => {
      setImportResults(data);
      setStep("result");
      if (data.errors === 0) {
        toast.success(`Importação concluída: ${data.inserted} inseridos, ${data.updated} atualizados.`);
      } else {
        toast.warning(`Importação com erros: ${data.inserted} inseridos, ${data.updated} atualizados, ${data.errors} erros.`);
      }
      onSuccess?.();
    },
    onError: (err) => {
      toast.error("Erro na importação: " + err.message);
    },
  });

  const handleFile = useCallback((file: File) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = parseRows(ws);
        if (rows.length === 0) {
          toast.error("Nenhuma linha válida encontrada na planilha.");
          return;
        }
        setParsedRows(rows);
        setStep("preview");
      } catch {
        toast.error("Erro ao ler o arquivo. Verifique se é um .xls ou .xlsx válido.");
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleImport = () => {
    if (!tenantId) { toast.error("Selecione o cliente antes de importar."); return; }
    importMutation.mutate({ tenantId, rows: parsedRows });
  };

  const handleReset = () => {
    setParsedRows([]);
    setFileName("");
    setStep("upload");
    setImportResults(null);
  };

  const handleClose = () => {
    handleReset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-green-600" />
            Importar Produtos via Excel
          </DialogTitle>
          <DialogDescription>
            Faça upload de uma planilha .xls ou .xlsx com a lista de produtos. SKUs já existentes serão atualizados.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Seleção de cliente */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium whitespace-nowrap">Cliente *</span>
            <Select
              value={tenantId ? String(tenantId) : ""}
              onValueChange={(v) => setTenantId(Number(v))}
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Selecione o cliente" />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={downloadTemplate} className="ml-auto">
              <Download className="h-4 w-4 mr-1" />
              Baixar Modelo
            </Button>
          </div>

          {/* Step: Upload */}
          {step === "upload" && (
            <div
              className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium">Arraste o arquivo aqui ou clique para selecionar</p>
              <p className="text-xs text-muted-foreground mt-1">Formatos aceitos: .xls, .xlsx</p>
              <input
                ref={fileRef}
                type="file"
                accept=".xls,.xlsx"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          )}

          {/* Step: Preview */}
          {step === "preview" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <FileSpreadsheet className="h-4 w-4 text-green-600" />
                  <span className="font-medium">{fileName}</span>
                  <Badge variant="secondary">{parsedRows.length} linha(s)</Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={handleReset}>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Trocar arquivo
                </Button>
              </div>
              <div className="border rounded-lg overflow-auto max-h-72">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Unidade</TableHead>
                      <TableHead>Armazenagem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.slice(0, 50).map((row, i) => (
                      <TableRow key={i} className={!row.sku || !row.description ? "bg-red-50 dark:bg-red-950/20" : ""}>
                        <TableCell className="text-muted-foreground text-xs">{i + 2}</TableCell>
                        <TableCell className="font-mono text-xs">{row.sku || <span className="text-red-500">—</span>}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs">{row.description || <span className="text-red-500">—</span>}</TableCell>
                        <TableCell className="text-xs">{row.category || "—"}</TableCell>
                        <TableCell className="text-xs">{row.unitOfMeasure || "UN"}</TableCell>
                        <TableCell className="text-xs">{row.storageCondition || "ambient"}</TableCell>
                      </TableRow>
                    ))}
                    {parsedRows.length > 50 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-2">
                          + {parsedRows.length - 50} linhas não exibidas
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {parsedRows.some((r) => !r.sku || !r.description) && (
                <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded p-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Linhas com SKU ou Descrição vazios serão ignoradas na importação.
                </div>
              )}
            </div>
          )}

          {/* Step: Result */}
          {step === "result" && importResults && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3 text-center bg-green-50 dark:bg-green-950/20">
                  <p className="text-2xl font-bold text-green-700">{importResults.inserted}</p>
                  <p className="text-xs text-green-600 mt-1">Inseridos</p>
                </div>
                <div className="rounded-lg border p-3 text-center bg-blue-50 dark:bg-blue-950/20">
                  <p className="text-2xl font-bold text-blue-700">{importResults.updated}</p>
                  <p className="text-xs text-blue-600 mt-1">Atualizados</p>
                </div>
                <div className="rounded-lg border p-3 text-center bg-red-50 dark:bg-red-950/20">
                  <p className="text-2xl font-bold text-red-700">{importResults.errors}</p>
                  <p className="text-xs text-red-600 mt-1">Erros</p>
                </div>
              </div>

              {importResults.errors > 0 && (
                <div className="border rounded-lg overflow-auto max-h-48">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">Linha</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Detalhe</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importResults.results
                        .filter((r) => r.status === "error")
                        .map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{r.row}</TableCell>
                            <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                            <TableCell>
                              <XCircle className="h-4 w-4 text-red-500" />
                            </TableCell>
                            <TableCell className="text-xs text-red-600">{r.error}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {importResults.errors === 0 && (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 dark:bg-green-950/20 rounded p-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  Todos os produtos foram importados com sucesso!
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {step === "upload" && (
            <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button
                onClick={handleImport}
                disabled={importMutation.isPending || !tenantId || parsedRows.length === 0}
              >
                {importMutation.isPending ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Importando...</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" />Importar {parsedRows.length} produto(s)</>
                )}
              </Button>
            </>
          )}
          {step === "result" && (
            <>
              <Button variant="outline" onClick={handleReset}>Nova Importação</Button>
              <Button onClick={handleClose}>Fechar</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
