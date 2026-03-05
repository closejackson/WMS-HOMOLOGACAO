import { useState, useRef } from "react";
import JsBarcode from "jsbarcode";
import { LabelPreviewDialog } from "@/components/LabelPreviewDialog";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle, Printer } from "lucide-react";
import { toast } from "sonner";

interface ImportPreallocationDialogProps {
  receivingOrderId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ImportPreallocationDialog({
  receivingOrderId,
  open,
  onOpenChange,
  onSuccess,
}: ImportPreallocationDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [validations, setValidations] = useState<any[] | null>(null);
  const [stats, setStats] = useState<{ totalRows: number; validRows: number; invalidRows: number } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showLabelPreview, setShowLabelPreview] = useState(false);
  const [previewLabels, setPreviewLabels] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFileMutation = trpc.preallocation.processFile.useMutation({
    onSuccess: (data) => {
      setValidations(data.validations);
      setStats({
        totalRows: data.totalRows,
        validRows: data.validRows,
        invalidRows: data.invalidRows,
      });
      setIsProcessing(false);
      
      if (data.invalidRows > 0) {
        toast.warning(`${data.invalidRows} linha(s) com erro. Revise antes de salvar.`);
      } else {
        toast.success("Arquivo processado com sucesso!");
      }
    },
    onError: (error: any) => {
      toast.error("Erro ao processar arquivo: " + error.message);
      setIsProcessing(false);
    },
  });

  const saveMutation = trpc.preallocation.save.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.savedCount} pré-alocação(ões) salva(s) com sucesso!`);
      handleClose();
      onSuccess?.();
    },
    onError: (error: any) => {
      toast.error("Erro ao salvar pré-alocações: " + error.message);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setValidations(null);
      setStats(null);
    }
  };

  const handleProcess = async () => {
    if (!file) {
      toast.error("Selecione um arquivo Excel");
      return;
    }

    setIsProcessing(true);

    // Converter arquivo para base64
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      const fileBase64 = base64.split(",")[1]; // Remover prefixo data:...;base64,

      processFileMutation.mutate({
        receivingOrderId,
        fileBase64,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!validations) {
      toast.error("Processe o arquivo primeiro");
      return;
    }

    saveMutation.mutate({
      receivingOrderId,
      validations,
    });
  };

  const handleClose = () => {
    setFile(null);
    setValidations(null);
    setStats(null);
    setIsProcessing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onOpenChange(false);
  };

  const handlePrintLabels = () => {
    if (!validations || !stats || stats.validRows === 0) {
      toast.error("Nenhuma pré-alocação válida para imprimir");
      return;
    }

    // Filtrar apenas validações válidas
    const validPreallocations = validations.filter((v: any) => v.isValid);
    
    if (validPreallocations.length === 0) {
      toast.error("Nenhuma pré-alocação válida encontrada");
      return;
    }

    // Abrir modal de pré-visualização
    setPreviewLabels(validPreallocations);
    setShowLabelPreview(true);
  };

  const handleConfirmPrint = async () => {
    // Imprimir etiquetas diretamente
    await printPreallocationLabelsDirectly(previewLabels);
    toast.success(`${previewLabels.length} etiqueta(s) enviada(s) para impressão`);
    setShowLabelPreview(false);
    setPreviewLabels([]);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Pré-Alocação</DialogTitle>
          <DialogDescription>
            Faça upload de uma planilha Excel com as colunas: Endereço, Cód. Interno, Descrição (opcional), Lote, Quantidade.
            <a href="/templates/preallocacao-template.xlsx" download className="text-blue-600 hover:underline ml-2">
              Baixar modelo de planilha
            </a>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload de arquivo */}
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
            <div className="flex flex-col items-center gap-4">
              <FileSpreadsheet className="h-12 w-12 text-gray-400" />
              <div className="text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-upload"
                />
                <label htmlFor="file-upload">
                  <Button variant="outline" asChild>
                    <span className="cursor-pointer">
                      <Upload className="mr-2 h-4 w-4" />
                      Selecionar Arquivo Excel
                    </span>
                  </Button>
                </label>
                {file && (
                  <p className="mt-2 text-sm text-gray-600">
                    Arquivo selecionado: <strong>{file.name}</strong>
                  </p>
                )}
              </div>
              <Button
                onClick={handleProcess}
                disabled={!file || isProcessing}
                className="mt-2"
              >
                {isProcessing ? "Processando..." : "Processar Arquivo"}
              </Button>
            </div>
          </div>

          {/* Estatísticas */}
          {stats && (
            <div className="grid grid-cols-3 gap-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Total:</strong> {stats.totalRows} linhas
                </AlertDescription>
              </Alert>
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  <strong>Válidas:</strong> {stats.validRows}
                </AlertDescription>
              </Alert>
              <Alert className="border-red-200 bg-red-50">
                <XCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  <strong>Inválidas:</strong> {stats.invalidRows}
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Tabela de validações */}
          {validations && validations.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Status</TableHead>
                      <TableHead>Linha</TableHead>
                      <TableHead>Endereço</TableHead>
                      <TableHead>Cód. Interno</TableHead>
                      <TableHead>Lote</TableHead>
                      <TableHead className="text-right">Quantidade</TableHead>
                      <TableHead>Erros</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validations.map((validation, idx) => (
                      <TableRow key={idx} className={validation.isValid ? "" : "bg-red-50"}>
                        <TableCell>
                          {validation.isValid ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                        </TableCell>
                        <TableCell>{validation.row}</TableCell>
                        <TableCell className="font-mono text-sm">{validation.endereco}</TableCell>
                        <TableCell>{validation.codInterno}</TableCell>
                        <TableCell>{validation.lote}</TableCell>
                        <TableCell className="text-right">{validation.quantidade}</TableCell>
                        <TableCell>
                          {validation.errors.length > 0 && (
                            <ul className="text-sm text-red-600 list-disc list-inside">
                              {validation.errors.map((error: string, i: number) => (
                                <li key={i}>{error}</li>
                              ))}
                            </ul>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <div>
              {validations && stats && stats.validRows > 0 && (
                <Button
                  variant="outline"
                  onClick={handlePrintLabels}
                  disabled={!validations}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir Etiquetas ({stats.validRows})
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={!validations || stats?.validRows === 0 || saveMutation.isPending}
              >
                {saveMutation.isPending ? "Salvando..." : `Salvar ${stats?.validRows || 0} Pré-Alocação(ões)`}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Modal de Pré-visualização de Etiquetas */}
    <LabelPreviewDialog
      open={showLabelPreview}
      onOpenChange={setShowLabelPreview}
      labels={previewLabels}
      onConfirm={handleConfirmPrint}
      type="preallocation"
    />
    </>
  );
}

/**
 * Imprime etiquetas de pré-alocação diretamente via window.print()
 * Formato: 10cm x 5cm por etiqueta para Zebra GC420T
 * Espaçamento: 0,2cm entre etiquetas
 */
async function printPreallocationLabelsDirectly(preallocations: any[]) {
  // Criar container temporário para impressão
  const printContainer = document.createElement('div');
  printContainer.id = 'print-prealloc-labels-container';
  printContainer.style.position = 'fixed';
  printContainer.style.left = '-9999px';
  printContainer.style.top = '0';
  document.body.appendChild(printContainer);

  // Gerar códigos de barras antes do loop
  const barcodes = new Map<string, string>();
  for (const prealloc of preallocations) {
    if (!barcodes.has(prealloc.endereco)) {
      const barcode = await generatePreallocationBarcodeSVG(prealloc.endereco);
      barcodes.set(prealloc.endereco, barcode);
    }
  }

  // Criar etiquetas HTML
  for (const prealloc of preallocations) {
    const loteText = prealloc.lote ? `Lote: ${prealloc.lote}` : 'Sem lote';
    const productInfo = `Produto: ${prealloc.codInterno} | ${loteText} | Qtd: ${prealloc.quantidade}`;
    const barcodeSVG = barcodes.get(prealloc.endereco) || '';

    const labelDiv = document.createElement('div');
    labelDiv.className = 'print-prealloc-label';
    labelDiv.innerHTML = `
      <div class="print-prealloc-label-title">ENDEREÇO</div>
      <div class="print-prealloc-label-code">${prealloc.endereco}</div>
      <div class="print-prealloc-label-barcode">${barcodeSVG}</div>
      <div class="print-prealloc-label-info">Zona: Pré-Alocação | Tipo: Palete Inteiro</div>
      <div class="print-prealloc-label-description">${productInfo}</div>
    `;
    printContainer.appendChild(labelDiv);
  }

  // Adicionar CSS para impressão
  const style = document.createElement('style');
  style.textContent = `
    @media print {
      @page {
        size: 10cm 5cm;
        margin: 0;
      }
      body > *:not(#print-prealloc-labels-container) {
        display: none !important;
      }
      #print-prealloc-labels-container {
        position: static !important;
        left: auto !important;
        top: auto !important;
        width: 100%;
        display: block !important;
      }
      .print-prealloc-label {
        width: 10cm;
        height: 5cm;
        padding: 0.3cm 0.5cm;
        box-sizing: border-box;
        page-break-after: always;
        margin-bottom: 0.2cm;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
      }
      .print-prealloc-label:last-child {
        page-break-after: auto;
        margin-bottom: 0;
      }
      .print-prealloc-label-title {
        font-size: 14pt;
        font-weight: bold;
        color: #000;
        margin-bottom: 8px;
        letter-spacing: 2px;
      }
      .print-prealloc-label-code {
        font-size: 48pt;
        font-weight: bold;
        color: #000;
        margin: 10px 0;
        line-height: 1;
      }
      .print-prealloc-label-barcode {
        margin: 10px 0;
      }
      .print-prealloc-label-barcode img {
        max-width: 100%;
        height: auto;
      }
      .print-prealloc-label-info {
        font-size: 10pt;
        color: #000;
        margin: 3px 0;
      }
      .print-prealloc-label-description {
        font-size: 9pt;
        color: #000;
        margin: 2px 0;
      }
    }
  `;
  document.head.appendChild(style);

  // Aguardar um momento para renderização
  await new Promise(resolve => setTimeout(resolve, 100));

  // Abrir janela de impressão
  window.print();

  // Limpar após impressão
  setTimeout(() => {
    document.body.removeChild(printContainer);
    document.head.removeChild(style);
  }, 1000);
}

/**
 * Gera código de barras Code 128 usando JsBarcode
 */
function generatePreallocationBarcodeSVG(text: string): Promise<string> {
  try {
    // Criar elemento SVG temporário
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    
    // Gerar código de barras Code 128
    JsBarcode(svg, text, {
      format: 'CODE128',
      width: 2,
      height: 50,
      displayValue: true,
      fontSize: 14,
      margin: 5,
    });
    
    // Converter SVG para Base64 PNG
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    // Definir tamanho do canvas baseado no SVG
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    // Retornar promise que resolve com Base64
    return new Promise<string>((resolve) => {
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx?.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        const base64 = canvas.toDataURL('image/png');
        resolve(`<img src="${base64}" alt="${text}" />`);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(`<span style="font-family: monospace;">${text}</span>`);
      };
      img.src = url;
    });
  } catch (error) {
    console.error('Erro ao gerar código de barras:', error);
    return Promise.resolve(`<span style="font-family: monospace;">${text}</span>`);
  }
}
