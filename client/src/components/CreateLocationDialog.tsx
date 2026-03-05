import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { MapPin, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useEffect } from "react";

export function CreateLocationDialog() {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    zoneId: "",
    tenantId: "",
    code: "",
    aisle: "",
    rack: "",
    level: "",
    position: "",
    locationType: "whole" as "whole" | "fraction",
    storageRule: "single" as "single" | "multi",
  });

  const { data: zones } = trpc.zones.list.useQuery();
  const { data: tenants } = trpc.tenants.list.useQuery();
  const utils = trpc.useUtils();
  
  const createMutation = trpc.locations.create.useMutation({
    onSuccess: () => {
      toast.success("Endereço cadastrado com sucesso!");
      utils.locations.list.invalidate();
      setOpen(false);
      setFormData({
        zoneId: "",
        tenantId: "",
        code: "",
        aisle: "",
        rack: "",
        level: "",
        position: "",
        locationType: "whole",
        storageRule: "single",
      });
    },
    onError: (error) => {
      toast.error("Erro ao cadastrar endereço: " + error.message);
    },
  });

  // Gerar código automaticamente quando preencher rua, prédio, andar e quadrante
  useEffect(() => {
    const { aisle, rack, level, position, locationType } = formData;
    
    if (aisle && rack && level) {
      let generatedCode = "";
      
      if (locationType === "whole") {
        // Formato: A10-01-73 (RUA-PRÉDIO-ANDAR)
        generatedCode = `${aisle}-${rack}-${level}`;
      } else if (locationType === "fraction" && position) {
        // Formato: BI-A201-1D (RUA-PRÉDIO-ANDAR+QUADRANTE, sem hífen antes do quadrante)
        generatedCode = `${aisle}-${rack}-${level}${position}`;
      }
      
      if (generatedCode) {
        setFormData(prev => ({ ...prev, code: generatedCode }));
      }
    }
  }, [formData.aisle, formData.rack, formData.level, formData.position, formData.locationType]);

  const validateLocationCode = () => {
    const { code, locationType, position } = formData;
    
    if (!code.trim()) {
      return "Código do endereço é obrigatório";
    }
    
    // Regex para validação
    const wholeRegex = /^[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+$/; // Ex: A10-01-73
    const fractionRegex = /^[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+[A-Z]$/; // Ex: BI-A201-1D
    
    if (locationType === "whole") {
      if (!wholeRegex.test(code)) {
        return "Código inválido para endereço Inteiro. Formato esperado: RUA-PRÉDIO-ANDAR (ex: A10-01-73)";
      }
    } else if (locationType === "fraction") {
      if (!fractionRegex.test(code)) {
        return "Código inválido para endereço Fração. Formato esperado: RUA-PRÉDIO-ANDAR+QUADRANTE (ex: BI-A201-1D)";
      }
      
      // Validar quadrante (A, B, C, D)
      const quadrant = code.slice(-1);
      if (!["A", "B", "C", "D"].includes(quadrant)) {
        return "Quadrante inválido. Valores permitidos: A, B, C, D";
      }
      
      if (!position) {
        return "Quadrante é obrigatório para endereços do tipo Fração";
      }
    }
    
    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.zoneId) {
      toast.error("Selecione uma zona");
      return;
    }
    
    if (!formData.tenantId) {
      toast.error("Selecione um cliente");
      return;
    }
    
    const codeError = validateLocationCode();
    if (codeError) {
      toast.error(codeError);
      return;
    }

    createMutation.mutate({
      zoneId: parseInt(formData.zoneId),
      tenantId: parseInt(formData.tenantId),
      code: formData.code,
      aisle: formData.aisle || undefined,
      rack: formData.rack || undefined,
      level: formData.level || undefined,
      position: formData.position || undefined,
      locationType: formData.locationType,
      storageRule: formData.storageRule,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all bg-blue-600 hover:bg-blue-700 text-white h-9 px-4 py-2">
          <Plus className="h-4 w-4" />
          Novo Endereço
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-blue-600" />
              Cadastrar Novo Endereço
            </DialogTitle>
            <DialogDescription>
              Preencha os dados do endereço de armazenagem
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="zoneId">
                Zona <span className="text-red-500">*</span>
              </Label>
              <Select value={formData.zoneId} onValueChange={(value) => setFormData({ ...formData, zoneId: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a zona" />
                </SelectTrigger>
                <SelectContent>
                  {zones?.map((zone) => (
                    <SelectItem key={zone.id} value={zone.id.toString()}>
                      {zone.code} - {zone.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="tenantId">
                Cliente <span className="text-red-500">*</span>
              </Label>
              <Select value={formData.tenantId} onValueChange={(value) => setFormData({ ...formData, tenantId: value })}>
                <SelectTrigger>
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

            <div className="grid gap-2">
              <Label htmlFor="code">
                Código do Endereço <span className="text-red-500">*</span>
              </Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="Ex: A10-01-73 (Inteira) ou BI-A201-1D (Fração)"
                required
                readOnly
              />
              <p className="text-xs text-gray-500">Código gerado automaticamente ao preencher Rua, Prédio, Andar e Quadrante</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="aisle">Rua</Label>
                <Input
                  id="aisle"
                  value={formData.aisle}
                  onChange={(e) => setFormData({ ...formData, aisle: e.target.value.toUpperCase() })}
                  placeholder="Ex: A10 ou BI"
                />
                <p className="text-xs text-gray-500">Formato: Alfanumérico (ex: A10, BI, T01)</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rack">Prédio</Label>
                <Input
                  id="rack"
                  value={formData.rack}
                  onChange={(e) => setFormData({ ...formData, rack: e.target.value.toUpperCase() })}
                  placeholder="Ex: 01 ou A201"
                />
                <p className="text-xs text-gray-500">Formato: Alfanumérico (ex: 01, A201)</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="level">Andar</Label>
                <Input
                  id="level"
                  value={formData.level}
                  onChange={(e) => setFormData({ ...formData, level: e.target.value.toUpperCase() })}
                  placeholder={formData.locationType === "whole" ? "Ex: 73" : "Ex: 1"}
                />
                <p className="text-xs text-gray-500">
                  {formData.locationType === "whole" ? "Formato: Alfanumérico (ex: 73, 01)" : "Formato: Alfanumérico (ex: 1, 2)"}
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="position">Quadrante</Label>
                <Input
                  id="position"
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value.toUpperCase() })}
                  placeholder="Ex: D"
                  disabled={formData.locationType === "whole"}
                />
                <p className="text-xs text-gray-500">
                  {formData.locationType === "fraction" 
                    ? "Obrigatório para Fração. Valores: A, B, C, D" 
                    : "Não aplicável para Inteira"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="locationType">Tipo de Endereço</Label>
                <Select
                  value={formData.locationType}
                  onValueChange={(value: any) => setFormData({ ...formData, locationType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whole">Inteira (Whole)</SelectItem>
                    <SelectItem value="fraction">Fração (Fraction)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="storageRule">Regra de Armazenagem</Label>
                <Select
                  value={formData.storageRule}
                  onValueChange={(value: any) => setFormData({ ...formData, storageRule: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Único Item/Lote</SelectItem>
                    <SelectItem value="multi">Multi-Item</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Cadastrando..." : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
