import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Upload, Download, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface ClientPortalImportOrdersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

/**
 * Componente de importação de pedidos específico para o Portal do Cliente
 * Usa apenas autenticação do Portal (cookie client_portal_session)
 * NÃO usa OAuth
 */
export function ClientPortalImportOrdersDialog({ 
  open, 
  onOpenChange,
  onSuccess 
}: ClientPortalImportOrdersDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const importMutation = trpc.clientPortal.importOrders.useMutation({
    onSuccess: (data) => {
      setResults(data);
      setIsProcessing(false);
      
      if (data.success.length > 0) {
        toast.success(`${data.success.length} pedido(s) importado(s) com sucesso!`);
      }
      if (data.errors.length > 0) {
        toast.error(`${data.errors.length} erro(s) encontrado(s)`);
      }
      
      if (onSuccess && data.success.length > 0) {
        onSuccess();
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
                <h4 className="font-semibold text-blue-900 mb-1">
                  Formato do Arquivo
                </h4>
                <p className="text-sm text-blue-800 mb-3">
                  Use o template Excel para garantir que seus dados estejam no formato correto.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTemplate}
                  className="bg-white"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Baixar Template
                </Button>
              </div>
            </div>
          </div>

          {/* Upload de arquivo */}
          <div className="space-y-4">
            <div>
              <label
                htmlFor="file-upload"
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="h-10 w-10 text-gray-400 mb-2" />
                  <p className="mb-2 text-sm text-gray-500">
                    <span className="font-semibold">Clique para selecionar</span> ou arraste o arquivo
                  </p>
                  <p className="text-xs text-gray-500">Excel (.xlsx ou .xls)</p>
                </div>
                <input
                  id="file-upload"
                  type="file"
                  className="hidden"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                />
              </label>
            </div>

            {file && (
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-700">{file.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFile(null)}
                >
                  Remover
                </Button>
              </div>
            )}

            <Button
              onClick={handleImport}
              disabled={!file || isProcessing}
              className="w-full"
            >
              {isProcessing ? "Processando..." : "Importar Pedidos"}
            </Button>
          </div>

          {/* Resultados */}
          {results && (
            <div className="space-y-4">
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">Resultado da Importação</h3>

                {/* Sucessos */}
                {results.success.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <span className="font-medium text-green-900">
                        {results.success.length} pedido(s) importado(s) com sucesso
                      </span>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                      {results.success.map((item: any, index: number) => (
                        <div key={index} className="text-sm text-green-800 py-1">
                          ✓ Pedido {item.orderNumber || `#${index + 1}`}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Erros */}
                {results.errors.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <XCircle className="h-5 w-5 text-red-600" />
                      <span className="font-medium text-red-900">
                        {results.errors.length} erro(s) encontrado(s)
                      </span>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                      {results.errors.map((error: any, index: number) => (
                        <div key={index} className="text-sm text-red-800 py-1">
                          ✗ Linha {error.row || index + 1}: {error.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
