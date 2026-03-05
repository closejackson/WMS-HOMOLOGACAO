import React, { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Upload, Download, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";

interface PreallocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receivingOrderId: number;
  onSuccess?: () => void;
}

interface ValidationResult {
  isValid: boolean;
  row: number;
  endereco: string;
  codInterno: string;
  lote: string;
  quantidade: number;
  errors: string[];
  locationId?: number;
  productId?: number;
}

export function PreallocationDialog({
  open,
  onOpenChange,
  receivingOrderId,
  onSuccess,
}: PreallocationDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [validations, setValidations] = useState<ValidationResult[]>([]);
  const [summary, setSummary] = useState<{
    totalRows: number;
    validRows: number;
    invalidRows: number;
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFileMutation = trpc.preallocation.processFile.useMutation();
  const saveMutation = trpc.preallocation.save.useMutation();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith(".xlsx")) {
        toast.error("Por favor, selecione um arquivo Excel (.xlsx)");
        return;
      }
      setFile(selectedFile);
      processFile(selectedFile);
    }
  };

  const processFile = async (file: File) => {
    setIsProcessing(true);
    try {
      // Ler arquivo como base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        const fileBase64 = base64.split(",")[1]; // Remover prefixo data:...

        try {
          const result = await processFileMutation.mutateAsync({
            receivingOrderId,
            fileBase64,
          });

          setValidations(result.validations);
          setSummary({
            totalRows: result.totalRows,
            validRows: result.validRows,
            invalidRows: result.invalidRows,
          });

          if (result.invalidRows > 0) {
            toast.warning(
              `${result.validRows} linhas válidas, ${result.invalidRows} inválidas`
            );
          } else {
            toast.success(`Todas as ${result.validRows} linhas são válidas!`);
          }
        } catch (error: any) {
          toast.error(error.message || "Erro ao processar arquivo");
        } finally {
          setIsProcessing(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      toast.error("Erro ao ler arquivo");
      setIsProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!validations.length) {
      toast.error("Nenhuma pré-alocação para salvar");
      return;
    }

    try {
      const result = await saveMutation.mutateAsync({
        receivingOrderId,
        validations,
      });

      toast.success(`${result.savedCount} pré-alocações salvas com sucesso!`);
      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar pré-alocações");
    }
  };

  const handleDownloadTemplate = () => {
    // Criar planilha modelo
    const csvContent = [
      "Endereço,Cód. Interno,Descrição,Lote,Quantidade",
      "M01-01-02A,123456,Produto Exemplo,L001,100",
      "M01-01-03A,234567,Outro Produto,L002,50",
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "modelo-preallocacao.csv";
    link.click();
  };

  const handleSkip = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pré-Alocação de Endereços</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Área de Upload */}
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              onChange={handleFileSelect}
              className="hidden"
            />

            {!file ? (
              <>
                <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <p className="text-sm text-gray-600 mb-4">
                  Faça upload da planilha Excel com as pré-alocações
                </p>
                <div className="flex gap-2 justify-center">
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing}
                  >
                    Selecionar Arquivo
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleDownloadTemplate}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Baixar Modelo
                  </Button>
                </div>
              </>
            ) : (
              <>
                <CheckCircle2 className="mx-auto h-12 w-12 text-green-500 mb-4" />
                <p className="text-sm font-medium mb-2">{file.name}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFile(null);
                    setValidations([]);
                    setSummary(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                >
                  Trocar Arquivo
                </Button>
              </>
            )}
          </div>

          {/* Resumo */}
          {summary && (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Total de Linhas</p>
                <p className="text-2xl font-bold text-blue-600">
                  {summary.totalRows}
                </p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Válidas</p>
                <p className="text-2xl font-bold text-green-600">
                  {summary.validRows}
                </p>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Inválidas</p>
                <p className="text-2xl font-bold text-red-600">
                  {summary.invalidRows}
                </p>
              </div>
            </div>
          )}

          {/* Tabela de Validações */}
          {validations.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left">Linha</th>
                      <th className="px-4 py-2 text-left">Endereço</th>
                      <th className="px-4 py-2 text-left">Cód. Interno</th>
                      <th className="px-4 py-2 text-left">Lote</th>
                      <th className="px-4 py-2 text-right">Quantidade</th>
                      <th className="px-4 py-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validations.map((validation, index) => (
                      <tr
                        key={index}
                        className={
                          validation.isValid
                            ? "hover:bg-gray-50"
                            : "bg-red-50 hover:bg-red-100"
                        }
                      >
                        <td className="px-4 py-2 border-b">{validation.row}</td>
                        <td className="px-4 py-2 border-b font-mono text-xs">
                          {validation.endereco}
                        </td>
                        <td className="px-4 py-2 border-b font-mono text-xs">
                          {validation.codInterno}
                        </td>
                        <td className="px-4 py-2 border-b font-mono text-xs">
                          {validation.lote}
                        </td>
                        <td className="px-4 py-2 border-b text-right">
                          {validation.quantidade}
                        </td>
                        <td className="px-4 py-2 border-b text-center">
                          {validation.isValid ? (
                            <CheckCircle2 className="inline h-5 w-5 text-green-500" />
                          ) : (
                            <div className="flex items-center justify-center gap-2">
                              <XCircle className="h-5 w-5 text-red-500" />
                              <div className="text-xs text-left text-red-600">
                                {validation.errors.map((err, i) => (
                                  <div key={i}>{err}</div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Botões de Ação */}
          <div className="flex justify-between pt-4 border-t">
            <Button variant="outline" onClick={handleSkip}>
              Pular Pré-alocação
            </Button>
            <div className="flex gap-2">
              {summary && summary.validRows > 0 && (
                <Button
                  onClick={handleSave}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending
                    ? "Salvando..."
                    : `Salvar ${summary.validRows} Pré-alocações`}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
