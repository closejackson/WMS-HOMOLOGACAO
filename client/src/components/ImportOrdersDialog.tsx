import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Upload, Download, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface ImportOrdersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportOrdersDialog({ open, onOpenChange }: ImportOrdersDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const importMutation = trpc.picking.importOrders.useMutation({
    onSuccess: (data) => {
      setResults(data);
      setIsProcessing(false);
      
      if (data.success.length > 0) {
        toast.success(`${data.success.length} pedido(s) importado(s) com sucesso!`);
      }
      if (data.errors.length > 0) {
        toast.error(`${data.errors.length} erro(s) encontrado(s)`);
      }
    },
    onError: (error) => {
      setIsProcessing(false);
      toast.error(error.message || "Erro ao importar pedidos");
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
        toast.error("Por favor, selecione um arquivo Excel (.xlsx ou .xls)");
        return;
      }
      setFile(selectedFile);
      setResults(null);
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast.error("Selecione um arquivo para importar");
      return;
    }

    setIsProcessing(true);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        const base64Data = base64.split(',')[1]; // Remove o prefixo data:...;base64,
        
        await importMutation.mutateAsync({ fileData: base64Data });
      };
      reader.readAsDataURL(file);
    } catch (error) {
      setIsProcessing(false);
      toast.error("Erro ao ler arquivo");
    }
  };

  const handleDownloadTemplate = () => {
    const link = document.createElement('a');
    link.href = '/templates/template-importacao-pedidos.xlsx';
    link.download = 'template-importacao-pedidos.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Template baixado com sucesso!");
  };

  const handleClose = () => {
    setFile(null);
    setResults(null);
    setIsProcessing(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Pedidos via Excel</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Botão de download do template */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-blue-900 font-medium mb-2">
                  Baixe o template para preencher os dados dos pedidos
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTemplate}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Baixar Template Excel
                </Button>
              </div>
            </div>
          </div>

          {/* Upload de arquivo */}
          {!results && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-sm text-gray-600 mb-4">
                  {file ? file.name : "Selecione o arquivo Excel com os pedidos"}
                </p>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-upload"
                />
                <label htmlFor="file-upload">
                  <Button type="button" variant="outline" asChild>
                    <span>Selecionar Arquivo</span>
                  </Button>
                </label>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={handleImport}
                  disabled={!file || isProcessing}
                >
                  {isProcessing ? "Processando..." : "Importar Pedidos"}
                </Button>
              </div>
            </div>
          )}

          {/* Resultados da importação */}
          {results && (
            <div className="space-y-4">
              {/* Resumo */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span className="font-semibold text-green-900">Sucesso</span>
                  </div>
                  <p className="text-2xl font-bold text-green-700">{results.success.length}</p>
                  <p className="text-sm text-green-600">pedidos importados</p>
                </div>

                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <XCircle className="h-5 w-5 text-red-600" />
                    <span className="font-semibold text-red-900">Erros</span>
                  </div>
                  <p className="text-2xl font-bold text-red-700">{results.errors.length}</p>
                  <p className="text-sm text-red-600">erros encontrados</p>
                </div>
              </div>

              {/* Pedidos importados com sucesso */}
              {results.success.length > 0 && (
                <div>
                  <h3 className="font-semibold text-green-900 mb-2 flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5" />
                    Pedidos Importados
                  </h3>
                  <div className="border border-green-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-green-50">
                        <tr>
                          <th className="px-4 py-2 text-left">Nº Pedido</th>
                          <th className="px-4 py-2 text-left">Nº Sistema</th>
                          <th className="px-4 py-2 text-left">Cliente</th>
                          <th className="px-4 py-2 text-left">Destinatário</th>
                          <th className="px-4 py-2 text-right">Itens</th>
                          <th className="px-4 py-2 text-right">Qtd Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.success.map((item: any, idx: number) => (
                          <tr key={idx} className="border-t border-green-100">
                            <td className="px-4 py-2">{item.pedido}</td>
                            <td className="px-4 py-2 font-mono text-xs">{item.numeroSistema}</td>
                            <td className="px-4 py-2">{item.cliente}</td>
                            <td className="px-4 py-2">{item.destinatario}</td>
                            <td className="px-4 py-2 text-right">{item.itens}</td>
                            <td className="px-4 py-2 text-right">{item.quantidadeTotal}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Erros */}
              {results.errors.length > 0 && (
                <div>
                  <h3 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
                    <XCircle className="h-5 w-5" />
                    Erros Encontrados
                  </h3>
                  <div className="border border-red-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-red-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left">Pedido/Linha</th>
                          <th className="px-4 py-2 text-left">Erro</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.errors.map((error: any, idx: number) => (
                          <tr key={idx} className="border-t border-red-100">
                            <td className="px-4 py-2">
                              {error.pedido && <span className="font-medium">{error.pedido}</span>}
                              {error.linha && <span className="text-gray-500 ml-2">(linha {error.linha})</span>}
                              {!error.pedido && error.linha && <span>Linha {error.linha}</span>}
                            </td>
                            <td className="px-4 py-2 text-red-700">{error.erro}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Botões finais */}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Fechar
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setResults(null);
                  }}
                >
                  Importar Outro Arquivo
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
