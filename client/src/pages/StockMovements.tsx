import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { toast } from "sonner";
import { ArrowRightLeft, AlertCircle, Plus, History } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ReleaseInventoryModal } from "@/components/ReleaseInventoryModal";
import { format } from "date-fns";

export default function StockMovements() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  // Estado para liberação gerencial de estoque restrito
  const [releaseModal, setReleaseModal] = useState<{
    open: boolean;
    status: "blocked" | "quarantine";
    labelCode?: string;
    inventoryId?: number;
    itemDescription?: string;
    retryPayload?: Parameters<typeof registerMovement.mutate>[0];
  }>({ open: false, status: "quarantine" });
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);
  const [fromLocationId, setFromLocationId] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [movementType, setMovementType] = useState<"transfer" | "adjustment" | "return" | "disposal" | "quality">("transfer");
  const [notes, setNotes] = useState("");

  const utils = trpc.useUtils();

  // Query de clientes
  const { data: tenants = [] } = trpc.tenants.list.useQuery();
  
  // Queries
  const { data: movements = [], isLoading } = trpc.stock.getMovements.useQuery({});
  const { data: locationsWithStock = [] } = trpc.stock.getLocationsWithStock.useQuery(
    { tenantId: selectedTenantId },
    { enabled: !!selectedTenantId }
  );
  
  // Query de produtos do endereço origem (só busca quando fromLocationId está definido)
  const { data: locationProducts = [] } = trpc.stock.getLocationProducts.useQuery(
    { 
      locationId: Number(fromLocationId),
      tenantId: selectedTenantId,
    },
    { enabled: !!fromLocationId && !!selectedTenantId }
  );

  // Query de endereços destino (filtrados por tipo de movimentação)
  // Obtém produto selecionado para filtrar
  const selectedProductForFilter = locationProducts.find(p => `${p.productId}-${p.batch || ""}` === selectedProduct);
  
  const { data: destinationLocations = [] } = trpc.stock.getDestinationLocations.useQuery(
    {
      movementType,
      productId: selectedProductForFilter?.productId,
      batch: selectedProductForFilter?.batch || undefined,
      tenantId: selectedProductForFilter?.tenantId,
    },
    { enabled: !!selectedProduct && movementType !== "adjustment" && movementType !== "disposal" }
  );

  // Query de sugestão automática (zona REC + pré-alocação)
  const { data: suggestedDestination } = trpc.stock.getSuggestedDestination.useQuery(
    {
      fromLocationId: Number(fromLocationId),
      productId: selectedProductForFilter?.productId || 0,
      batch: selectedProductForFilter?.batch || null,
      quantity: Number(quantity) || 0,
    },
    { enabled: !!fromLocationId && !!selectedProduct && !!quantity && Number(quantity) > 0 }
  );

  // Auto-preencher endereço destino quando houver sugestão
  useEffect(() => {
    if (suggestedDestination?.locationId) {
      setToLocationId(String(suggestedDestination.locationId));
      toast.success(`Endereço sugerido: ${suggestedDestination.locationCode} (${suggestedDestination.zoneName})`, {
        duration: 5000,
      });
    }
  }, [suggestedDestination]);

  // Mutation
  const registerMovement = trpc.stock.registerMovement.useMutation({
    onSuccess: () => {
      toast.success("Movimentação registrada com sucesso!");
      utils.stock.getMovements.invalidate();
      utils.stock.getPositions.invalidate();
      handleCloseDialog();
    },
    onError: (error) => {
      const msg = error.message || "";
      // Detectar erro de status restrito e abrir modal de liberação gerencial
      if (msg.startsWith("RESTRICTED_STATUS:")) {
        const parts = msg.split(":");
        const restrictedStatus = parts[1] as "blocked" | "quarantine";
        const product = locationProducts.find(p => `${p.productId}-${p.batch || ""}` === selectedProduct);
        setReleaseModal({
          open: true,
          status: restrictedStatus,
          itemDescription: product
            ? `${product.productDescription || ""} | Lote: ${product.batch || "sem lote"}`
            : undefined,
          retryPayload: {
            productId: product?.productId || 0,
            fromLocationId: Number(fromLocationId),
            toLocationId: toLocationId ? Number(toLocationId) : undefined,
            quantity: Number(quantity),
            batch: product?.batch || undefined,
            movementType,
            notes: notes || undefined,
            adminReleaseAuthorized: true,
          },
        });
        return;
      }
      toast.error(msg || "Erro ao registrar movimentação");
    },
  });

  const handleOpenDialog = () => {
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setSelectedTenantId(null);
    setFromLocationId("");
    setSelectedProduct("");
    setToLocationId("");
    setQuantity("");
    setMovementType("transfer");
    setNotes("");
  };
  
  // Limpar seleções ao trocar de cliente
  useEffect(() => {
    setFromLocationId("");
    setSelectedProduct("");
    setToLocationId("");
    setQuantity("");
  }, [selectedTenantId]);

  const handleSubmit = () => {
    // Validação: endereço destino é opcional apenas para descarte
    if (!fromLocationId || !selectedProduct || !quantity) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    
    if (movementType !== "disposal" && !toLocationId) {
      toast.error("Endereço destino é obrigatório para este tipo de movimentação");
      return;
    }

    const product = locationProducts.find(p => `${p.productId}-${p.batch || ""}` === selectedProduct);
    if (!product) {
      toast.error("Produto não encontrado");
      return;
    }

    registerMovement.mutate({
      productId: product.productId,
      fromLocationId: Number(fromLocationId),
      toLocationId: toLocationId ? Number(toLocationId) : undefined,
      quantity: Number(quantity),
      batch: product.batch || undefined,
      movementType,
      notes: notes || undefined,
    });
  };

  // Badge de tipo de movimentação
  const getMovementTypeBadge = (type: string) => {
    const typeConfig: Record<string, { label: string; className: string }> = {
      transfer: { label: "Transferência", className: "bg-blue-100 text-blue-800 border-blue-300" },
      adjustment: { label: "Ajuste", className: "bg-yellow-100 text-yellow-800 border-yellow-300" },
      return: { label: "Devolução", className: "bg-green-100 text-green-800 border-green-300" },
      disposal: { label: "Descarte", className: "bg-red-100 text-red-800 border-red-300" },
      quality: { label: "Qualidade", className: "bg-indigo-100 text-indigo-800 border-indigo-300" },
      receiving: { label: "Recebimento", className: "bg-purple-100 text-purple-800 border-purple-300" },
      picking: { label: "Separação", className: "bg-orange-100 text-orange-800 border-orange-300" },
    };
    const config = typeConfig[type] || typeConfig.transfer;
    return <Badge variant="outline" className={config.className}>{config.label}</Badge>;
  };

  // Obter produto selecionado para mostrar saldo disponível
  const selectedProductData = locationProducts.find(p => `${p.productId}-${p.batch || ""}` === selectedProduct);
  const maxQuantity = selectedProductData?.quantity || 0;

  // Endereços de destino: usar filtrados ou todos com estoque
  const availableDestinations = (movementType === "transfer" || movementType === "return" || movementType === "quality") && selectedProduct
    ? destinationLocations
    : locationsWithStock.filter((loc) => String(loc.id) !== fromLocationId);

  // Preparar opções para Combobox de endereços origem
  const originLocationOptions = useMemo<ComboboxOption[]>(() => {
    return locationsWithStock.map((loc) => ({
      value: String(loc.id),
      label: `${loc.code} (${loc.zoneName})`,
      searchTerms: `${loc.code} ${loc.zoneName}`.toLowerCase(),
    }));
  }, [locationsWithStock]);

  // Preparar opções para Combobox de endereços destino
  const destinationLocationOptions = useMemo<ComboboxOption[]>(() => {
    return availableDestinations.map((loc) => ({
      value: String(loc.id),
      label: `${loc.code} (${loc.zoneName})`,
      searchTerms: `${loc.code} ${loc.zoneName}`.toLowerCase(),
    }));
  }, [availableDestinations]);

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={<ArrowRightLeft className="h-8 w-8" />}
        title="Movimentações de Estoque"
        description="Registre e consulte movimentações entre endereços"
        actions={
          <Button onClick={handleOpenDialog}>
            <Plus className="w-4 h-4 mr-2" /> Nova Movimentação
          </Button>
        }
      />

      <div className="container py-8">
        {/* Tabela de Histórico */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="w-5 h-5" /> Histórico de Movimentações
            </CardTitle>
            <CardDescription>{movements.length} movimentação(ões) registrada(s)</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Carregando...</div>
            ) : movements.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>Nenhuma movimentação registrada</AlertDescription>
              </Alert>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Lote</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Destino</TableHead>
                      <TableHead className="text-right">Quantidade</TableHead>
                      <TableHead>Operador</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((mov) => (
                      <TableRow key={mov.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm">{format(new Date(mov.createdAt), "dd-MM-yyyy, HH:mm")}</span>
                          </div>
                        </TableCell>
                        <TableCell>{getMovementTypeBadge(mov.movementType)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{mov.productDescription}</span>
                            <span className="text-xs text-gray-500">{mov.productSku}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{mov.batch || "-"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span className="text-xs bg-gray-100 px-2 py-1 rounded">{mov.fromLocationCode || "-"}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span className="text-xs bg-gray-100 px-2 py-1 rounded">{mov.toLocationCode || "-"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-semibold">{mov.quantity.toLocaleString("pt-BR")}</span>
                        </TableCell>
                        <TableCell className="text-sm">{mov.performedByName || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog de Nova Movimentação */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova Movimentação de Estoque</DialogTitle>
            <DialogDescription>
              Registre uma movimentação entre endereços
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Cliente */}
            <div className="grid gap-2">
              <Label htmlFor="tenant">Cliente *</Label>
              <Select 
                value={selectedTenantId ? String(selectedTenantId) : ""} 
                onValueChange={(value) => setSelectedTenantId(Number(value))}
              >
                <SelectTrigger id="tenant">
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={String(tenant.id)}>
                      {tenant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!selectedTenantId && (
                <p className="text-sm text-muted-foreground">
                  Selecione um cliente para visualizar produtos e endereços disponíveis
                </p>
              )}
            </div>

            {/* Endereço Origem */}
            {selectedTenantId && (
            <div className="grid gap-2">
              <Label htmlFor="fromLocation">Endereço Origem *</Label>
              <Combobox
                options={originLocationOptions}
                value={fromLocationId}
                onValueChange={setFromLocationId}
                placeholder="Selecione o endereço origem"
                searchPlaceholder="Buscar endereço..."
                emptyText="Nenhum endereço encontrado"
              />
            </div>
            )}
            {/* Produto/Lote */}
            {fromLocationId && selectedTenantId && (
              <div className="grid gap-2">
                <Label htmlFor="product">Produto/Lote *</Label>
                <Combobox
                  options={locationProducts.map((prod, index) => ({
                    value: `${prod.productId}-${prod.batch || ""}`,
                    label: `${prod.productSku} - ${prod.productDescription} | Lote: ${prod.batch || "SEM LOTE"} | Saldo: ${prod.quantity}`,
                    searchTerms: `${prod.productSku} ${prod.productDescription} ${prod.batch || ""}`.toLowerCase(),
                  }))}
                  value={selectedProduct}
                  onValueChange={setSelectedProduct}
                  placeholder="Selecione o produto"
                  emptyText="Nenhum produto disponível"
                  searchPlaceholder="Buscar por SKU, descrição ou lote..."
                />
                {selectedProductData && (
                  <p className="text-sm text-muted-foreground">
                    Saldo disponível: <strong>{maxQuantity}</strong> unidades
                  </p>
                )}
              </div>
            )}

            {/* Quantidade */}
            <div className="grid gap-2">
              <Label htmlFor="quantity">Quantidade *</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                max={maxQuantity}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Digite a quantidade"
              />
            </div>

            {/* Endereço Destino (oculto para descarte) */}
            {movementType !== "disposal" && (
              <div className="grid gap-2">
                <Label htmlFor="toLocation">Endereço Destino *</Label>
                <Combobox
                  options={destinationLocationOptions}
                  value={toLocationId}
                  onValueChange={setToLocationId}
                  placeholder="Selecione o endereço destino"
                  searchPlaceholder="Buscar endereço..."
                  emptyText="Nenhum endereço disponível"
                  disabled={availableDestinations.length === 0}
                />
                {suggestedDestination && toLocationId === String(suggestedDestination.locationId) && (
                  <Alert className="mt-2 border-green-200 bg-green-50">
                    <AlertCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800">
                      <strong>Sugestão automática:</strong> Este endereço foi sugerido com base na pré-alocação do recebimento.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {/* Tipo de Movimentação */}
            <div className="grid gap-2">
              <Label htmlFor="movementType">Tipo de Movimentação *</Label>
              <Select value={movementType} onValueChange={(v) => setMovementType(v as any)}>
                <SelectTrigger id="movementType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transfer">Transferência</SelectItem>
                  <SelectItem value="adjustment">Ajuste</SelectItem>
                  <SelectItem value="return">Devolução</SelectItem>
                  <SelectItem value="disposal">Descarte</SelectItem>
                  <SelectItem value="quality">Qualidade</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Observações */}
            <div className="grid gap-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Digite observações sobre a movimentação (opcional)"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={
                registerMovement.isPending || 
                !fromLocationId || 
                !selectedProduct || 
                (movementType !== "disposal" && !toLocationId) || 
                !quantity
              }
            >
              {registerMovement.isPending ? "Registrando..." : "Registrar Movimentação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Liberação Gerencial */}
      <ReleaseInventoryModal
        open={releaseModal.open}
        restrictedStatus={releaseModal.status}
        inventoryId={releaseModal.inventoryId}
        labelCode={releaseModal.labelCode}
        itemDescription={releaseModal.itemDescription}
        onClose={() => setReleaseModal(prev => ({ ...prev, open: false }))}
        onReleased={() => {
          // Após liberação, retentar a movimentação original com adminReleaseAuthorized=true
          if (releaseModal.retryPayload) {
            registerMovement.mutate(releaseModal.retryPayload);
          }
          setReleaseModal(prev => ({ ...prev, open: false }));
        }}
      />
    </div>
  );
}
