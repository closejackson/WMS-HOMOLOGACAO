import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileText, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { PreallocationDialog } from "@/components/PreallocationDialog";
import { toast } from "sonner";

export default function NFEImport() {
  const [, setLocation] = useLocation();
  const [tenantId, setTenantId] = useState("");
  const [tipo, setTipo] = useState<"entrada" | "saida">("entrada");
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [xmlContent, setXmlContent] = useState("");
  const [importResult, setImportResult] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showPreallocation, setShowPreallocation] = useState(false);

  const { data: tenants } = trpc.tenants.list.useQuery();

  const importMutation = trpc.nfe.import.useMutation({
    onSuccess: (result) => {
      setImportResult(result);
      toast.success("NF-e importada com sucesso!");
      setIsUploading(false);
    },
    onError: (error) => {
      toast.error("Erro ao importar NF-e: " + error.message);
      setIsUploading(false);
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".xml")) {
      toast.error("Por favor, selecione um arquivo XML válido");
      return;
    }

    setXmlFile(file);
    
    // Ler conteúdo do arquivo
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setXmlContent(content);
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (!tenantId) {
      toast.error("Selecione um cliente");
      return;
    }

    if (!xmlContent) {
      toast.error("Selecione um arquivo XML");
      return;
    }

    setIsUploading(true);
    setImportResult(null);
    importMutation.mutate({
      tenantId: parseInt(tenantId),
      xmlContent,
      tipo,
    });
  };

  return (
    <>
      <PageHeader
        icon={<Upload className="w-8 h-8" />}
        title="Importação de NF-e"
        description="Importe notas fiscais eletrônicas de entrada (recebimento) ou saída (separação)"
      />
      <div className="container mx-auto px-6 py-8">
        <div className="max-w-4xl mx-auto">

        {/* Formulário de Upload */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Upload de XML da NF-e</CardTitle>
            <CardDescription>
              Selecione o cliente e faça upload do arquivo XML da nota fiscal
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Seleção de Tipo */}
            <div className="grid gap-2">
              <Label htmlFor="tipo">
                Tipo de Movimento <span className="text-red-500">*</span>
              </Label>
              <Select value={tipo} onValueChange={(value: "entrada" | "saida") => setTipo(value)}>
                <SelectTrigger className="bg-white text-gray-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada (Recebimento)</SelectItem>
                  <SelectItem value="saida">Saída (Separação)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Seleção de Cliente */}
            <div className="grid gap-2">
              <Label htmlFor="tenant">
                {tipo === "entrada" ? "Fornecedor" : "Armazém/Cliente"} <span className="text-red-500">*</span>
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                {tipo === "entrada" 
                  ? "Selecione o fornecedor que está enviando a mercadoria" 
                  : "Selecione o armazém/cliente que está expedindo (ex: Hapvida)"}
              </p>
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger className="bg-white text-gray-800">
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  {tenants?.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id.toString()}>
                      {tenant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Upload de Arquivo */}
            <div className="grid gap-2">
              <Label htmlFor="xml-file">
                Arquivo XML <span className="text-red-500">*</span>
              </Label>
              <div className="flex items-center gap-4">
                <label
                  htmlFor="xml-file"
                  className="flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors bg-white"
                >
                  <Upload className="h-5 w-5 text-gray-500" />
                  <span className="text-sm text-gray-600">
                    {xmlFile ? xmlFile.name : "Selecionar arquivo XML"}
                  </span>
                  <input
                    id="xml-file"
                    type="file"
                    accept=".xml"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
                {xmlFile && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setXmlFile(null);
                      setXmlContent("");
                      setImportResult(null);
                    }}
                  >
                    Limpar
                  </Button>
                )}
              </div>
            </div>

            {/* Botão de Importar */}
            <Button
              onClick={handleImport}
              disabled={!tenantId || !xmlContent || isUploading}
              className="w-full"
            >
              {isUploading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Importando...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Importar NF-e
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Resultado da Importação */}
        {importResult && (
          <Card>
            <CardHeader>
              <CardTitle>Resultado da Importação</CardTitle>
              <CardDescription>
                NF-e {importResult.nfeNumero} - Série {importResult.nfeSerie}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Informações Gerais */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm text-gray-600">Fornecedor</p>
                  <p className="font-medium">{importResult.fornecedor}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total de Produtos</p>
                  <p className="font-medium">{importResult.totalProdutos}</p>
                </div>
              </div>

              {/* Produtos Novos */}
              {importResult.produtosNovos.length > 0 && (
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription>
                    <p className="font-medium text-green-900 mb-2">
                      {importResult.produtosNovos.length} produto(s) cadastrado(s) automaticamente:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-green-800">
                      {importResult.produtosNovos.map((produto: string, index: number) => (
                        <li key={index}>{produto}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Produtos Existentes */}
              {importResult.produtosExistentes.length > 0 && (
                <Alert className="border-blue-200 bg-blue-50">
                  <AlertCircle className="h-4 w-4 text-blue-600" />
                  <AlertDescription>
                    <p className="font-medium text-blue-900 mb-2">
                      {importResult.produtosExistentes.length} produto(s) já cadastrado(s):
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-blue-800">
                      {importResult.produtosExistentes.map((produto: string, index: number) => (
                        <li key={index}>{produto}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Erros */}
              {importResult.erros.length > 0 && (
                <Alert className="border-red-200 bg-red-50">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription>
                    <p className="font-medium text-red-900 mb-2">
                      {importResult.erros.length} erro(s) encontrado(s):
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-red-800">
                      {importResult.erros.map((erro: string, index: number) => (
                        <li key={index}>{erro}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Ações */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setXmlFile(null);
                    setXmlContent("");
                    setImportResult(null);
                    setTenantId("");
                  }}
                >
                  Importar Outra NF-e
                </Button>
                {importResult.orderType === "entrada" && (
                  <Button
                    variant="outline"
                    onClick={() => setShowPreallocation(true)}
                  >
                    Pré-definir Endereços
                  </Button>
                )}
                <Button
                  onClick={() => {
                    if (importResult.orderType === "entrada") {
                      setLocation("/recebimento");
                    } else {
                      setLocation("/picking");
                    }
                  }}
                >
                  {importResult.orderType === "entrada" ? "Ver Recebimentos" : "Ver Separações"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        </div>
      </div>

      {/* Dialog de Pré-Alocação (apenas para entrada) */}
      {importResult && importResult.orderType === "entrada" && (
        <PreallocationDialog
          open={showPreallocation}
          onOpenChange={setShowPreallocation}
          receivingOrderId={importResult.orderId}
          onSuccess={() => {
            toast.success("Pré-alocações salvas! Agora você pode iniciar a conferência.");
          }}
        />
      )}
    </>
  );
}
