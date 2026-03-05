import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, XCircle, Barcode } from "lucide-react";

export default function ScannerTest() {
  const [scannedCode, setScannedCode] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const lookupMutation = trpc.receiving.lookupProductByLabel.useQuery(
    { labelCode: scannedCode },
    { enabled: false }
  );

  const handleScan = async () => {
    if (!scannedCode.trim()) {
      setError("Por favor, insira um código para buscar");
      return;
    }

    setError(null);
    setResult(null);

    try {
      const data = await lookupMutation.refetch();
      if (data.data) {
        setResult(data.data);
      }
    } catch (err: any) {
      setError(err.message || "Erro ao buscar etiqueta");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleScan();
    }
  };

  return (
    <div className="container mx-auto py-8">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Barcode className="h-6 w-6" />
            Teste de Scanner de Etiquetas
          </CardTitle>
          <CardDescription>
            Digite ou escaneie um código de barras para testar o sistema de reconhecimento
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Código de Barras</label>
            <div className="flex gap-2">
              <Input
                placeholder="Ex: 401460P22D08LB109"
                value={scannedCode}
                onChange={(e) => setScannedCode(e.target.value)}
                onKeyPress={handleKeyPress}
                className="font-mono"
                autoFocus
              />
              <Button onClick={handleScan} disabled={lookupMutation.isFetching}>
                {lookupMutation.isFetching ? "Buscando..." : "Buscar"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Pressione Enter ou clique em Buscar após escanear/digitar o código
            </p>
          </div>

          {error && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {result && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-semibold text-green-900">Etiqueta encontrada com sucesso!</p>
                  <div className="grid grid-cols-2 gap-2 text-sm mt-3">
                    <div>
                      <span className="font-medium">Código:</span>
                      <p className="font-mono">{result.labelCode}</p>
                    </div>
                    <div>
                      <span className="font-medium">SKU:</span>
                      <p className="font-mono">{result.productSku}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="font-medium">Produto:</span>
                      <p>{result.productName}</p>
                    </div>
                    <div>
                      <span className="font-medium">Lote:</span>
                      <p className="font-mono">{result.batch}</p>
                    </div>
                    <div>
                      <span className="font-medium">Validade:</span>
                      <p>{result.expiryDate ? new Date(result.expiryDate).toLocaleDateString('pt-BR') : "N/A"}</p>
                    </div>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="border-t pt-4">
            <h3 className="font-semibold mb-2">Códigos de Teste:</h3>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>• 401460PTEST001 (criado manualmente)</p>
              <p>• Gere novas etiquetas na tela de Recebimento para testar</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
