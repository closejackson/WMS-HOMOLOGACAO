import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Printer, ArrowLeft, Save } from "lucide-react";

export default function PrintSettings() {
  const [, navigate] = useLocation();
  const { data: settings, isLoading } = trpc.settings.getPrintSettings.useQuery();
  const updateMutation = trpc.settings.updatePrintSettings.useMutation();

  const [defaultFormat, setDefaultFormat] = useState<"zpl" | "pdf">("zpl");
  const [defaultCopies, setDefaultCopies] = useState(1);
  const [labelSize, setLabelSize] = useState("4x2");
  const [printerDpi, setPrinterDpi] = useState(203);
  const [autoPrint, setAutoPrint] = useState(true);

  // Atualizar estados quando dados carregarem
  useEffect(() => {
    if (settings && !isLoading) {
      setDefaultFormat(settings.defaultFormat);
      setDefaultCopies(settings.defaultCopies);
      setLabelSize(settings.labelSize);
      setPrinterDpi(settings.printerDpi);
      setAutoPrint(settings.autoPrint);
    }
  }, [settings, isLoading]);

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        defaultFormat,
        defaultCopies,
        labelSize,
        printerDpi,
        autoPrint,
      });
      toast.success("Configurações salvas com sucesso!");
    } catch (error: any) {
      toast.error(`Erro ao salvar configurações: ${error.message}`);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen p-6">
        <div className="container max-w-4xl">
          <p className="text-white/70">Carregando configurações...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="container max-w-4xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-white hover:text-white hover:bg-white/20 border border-white/30">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Printer className="h-6 w-6 text-blue-300" />
            <h1 className="text-2xl font-bold text-white drop-shadow">Configurações de Impressão</h1>
          </div>
        </div>

        {/* Card de Configurações */}
        <Card>
          <CardHeader>
            <CardTitle>Preferências de Etiquetas</CardTitle>
            <CardDescription>
              Configure as opções padrão para impressão de etiquetas de produtos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Formato Padrão */}
            <div className="space-y-2">
              <Label htmlFor="format">Formato Padrão</Label>
              <Select value={defaultFormat} onValueChange={(v) => setDefaultFormat(v as "zpl" | "pdf")}>
                <SelectTrigger id="format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zpl">Zebra (ZPL) - Impressora Térmica</SelectItem>
                  <SelectItem value="pdf">PDF - Impressora Comum</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-500">
                Formato utilizado por padrão ao gerar etiquetas
              </p>
            </div>

            {/* Número de Cópias */}
            <div className="space-y-2">
              <Label htmlFor="copies">Número de Cópias Padrão</Label>
              <Input
                id="copies"
                type="number"
                min="1"
                max="100"
                value={defaultCopies}
                onChange={(e) => setDefaultCopies(parseInt(e.target.value) || 1)}
              />
              <p className="text-sm text-gray-500">
                Quantidade de etiquetas a serem impressas por padrão
              </p>
            </div>

            {/* Tamanho da Etiqueta */}
            <div className="space-y-2">
              <Label htmlFor="size">Tamanho da Etiqueta</Label>
              <Select value={labelSize} onValueChange={setLabelSize}>
                <SelectTrigger id="size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="4x2">4" x 2" (10cm x 5cm)</SelectItem>
                  <SelectItem value="4x3">4" x 3" (10cm x 7,5cm)</SelectItem>
                  <SelectItem value="4x6">4" x 6" (10cm x 15cm)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-500">
                Dimensões da etiqueta em polegadas
              </p>
            </div>

            {/* Resolução da Impressora */}
            <div className="space-y-2">
              <Label htmlFor="dpi">Resolução da Impressora (DPI)</Label>
              <Select value={printerDpi.toString()} onValueChange={(v) => setPrinterDpi(parseInt(v))}>
                <SelectTrigger id="dpi">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="203">203 DPI (8 dpmm) - Padrão</SelectItem>
                  <SelectItem value="300">300 DPI (12 dpmm) - Alta Qualidade</SelectItem>
                  <SelectItem value="600">600 DPI (24 dpmm) - Máxima Qualidade</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-500">
                Resolução da impressora térmica Zebra
              </p>
            </div>

            {/* Impressão Automática */}
            <div className="flex items-center justify-between space-x-2">
              <div className="space-y-0.5">
                <Label htmlFor="auto-print">Abrir Diálogo de Impressão Automaticamente</Label>
                <p className="text-sm text-gray-500">
                  Ao gerar etiqueta, abrir janela de impressão automaticamente
                </p>
              </div>
              <Switch
                id="auto-print"
                checked={autoPrint}
                onCheckedChange={setAutoPrint}
              />
            </div>

            {/* Botões de Ação */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => navigate("/")}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={updateMutation.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {updateMutation.isPending ? "Salvando..." : "Salvar Configurações"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
