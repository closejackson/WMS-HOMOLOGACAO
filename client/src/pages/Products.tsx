import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Package, Pencil, Trash2, Search, X, FileSpreadsheet } from "lucide-react";
import { CreateProductDialog } from "@/components/CreateProductDialog";
import { ImportProductsDialog } from "@/components/ImportProductsDialog";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { useBusinessError } from "@/hooks/useBusinessError";

export default function Products() {
  // Estados dos filtros
  const [filterTenantId, setFilterTenantId] = useState<number | undefined>(undefined);
  const [filterSku, setFilterSku] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [skuDebounced, setSkuDebounced] = useState("");

  // Debounce do SKU
  useEffect(() => {
    const t = setTimeout(() => setSkuDebounced(filterSku), 400);
    return () => clearTimeout(t);
  }, [filterSku]);

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const hasFilters = !!filterTenantId || !!skuDebounced || !!filterCategory;

  const { data: products, isLoading } = trpc.products.list.useQuery(
    hasFilters
      ? {
          tenantId: filterTenantId,
          sku: skuDebounced || undefined,
          category: filterCategory || undefined,
        }
      : undefined
  );
  const { data: tenants } = trpc.tenants.list.useQuery();
  const utils = trpc.useUtils();

  // Derivar categorias únicas dos produtos carregados (sem filtro de categoria)
  const { data: allProducts } = trpc.products.list.useQuery(
    filterTenantId ? { tenantId: filterTenantId } : undefined
  );
  const categories = Array.from(
    new Set((allProducts ?? []).map((p: any) => p.category).filter(Boolean))
  ).sort() as string[];
  
  // Hook de erros de negócio
  const businessError = useBusinessError();
  
  // Estados de seleção múltipla
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [editForm, setEditForm] = useState<{
    tenantId: number;
    sku: string;
    description: string;
    category: string;
    gtin: string;
    anvisaRegistry: string;
    therapeuticClass: string;
    manufacturer: string;
    unitOfMeasure: string;
    unitsPerBox?: number;
    minQuantity: number;
    dispensingQuantity: number;
    storageCondition: "ambient" | "refrigerated_2_8" | "frozen_minus_20" | "controlled";
    requiresBatchControl: boolean;
    requiresExpiryControl: boolean;
    isControlledSubstance: boolean;
    status: "active" | "inactive" | "discontinued";
  }>({
    tenantId: 0,
    sku: "",
    description: "",
    category: "",
    gtin: "",
    anvisaRegistry: "",
    therapeuticClass: "",
    manufacturer: "",
    unitOfMeasure: "UN",
    unitsPerBox: undefined,
    minQuantity: 0,
    dispensingQuantity: 1,
    storageCondition: "ambient",
    requiresBatchControl: true,
    requiresExpiryControl: true,
    isControlledSubstance: false,
    status: "active",
  });

  const updateMutation = trpc.products.update.useMutation({
    onSuccess: () => {
      toast.success("Produto atualizado com sucesso!");
      utils.products.list.invalidate();
      setEditDialogOpen(false);
    },
    onError: (error) => {
      const message = error.message;
      
      if (message.includes("SKU já existe") || message.includes("duplicado")) {
        businessError.showDuplicateEntry("SKU", editForm.sku);
      } else if (message.includes("não tem permissão") || message.includes("FORBIDDEN")) {
        businessError.showPermissionDenied("atualizar produtos");
      } else {
        businessError.showGenericError(message);
      }
    },
  });

  const deleteMutation = trpc.products.delete.useMutation({
    onSuccess: () => {
      toast.success("Produto excluído com sucesso!");
      utils.products.list.invalidate();
      setDeleteDialogOpen(false);
    },
    onError: (error) => {
      const message = error.message;
      
      if (message.includes("não tem permissão") || message.includes("FORBIDDEN")) {
        businessError.showPermissionDenied("excluir produtos");
      } else if (message.includes("em uso") || message.includes("referência")) {
        businessError.showError({
          type: "invalid_data",
          title: "Produto em uso",
          message: "Este produto não pode ser excluído pois está sendo referenciado em pedidos ou estoque.",
          details: [
            {
              label: "Sugestão",
              value: "Altere o status do produto para 'Inativo' ao invés de excluí-lo.",
              variant: "default",
            },
          ],
        });
      } else {
        businessError.showGenericError(message);
      }
    },
  });

  const deleteManyMutation = trpc.products.deleteMany.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.deletedCount} produto(s) excluído(s) com sucesso!`);
      utils.products.list.invalidate();
      setSelectedIds([]);
      setBulkDeleteDialogOpen(false);
    },
    onError: (error) => {
      const message = error.message;
      
      if (message.includes("não tem permissão") || message.includes("FORBIDDEN")) {
        businessError.showPermissionDenied("excluir produtos em lote");
      } else {
        businessError.showGenericError(message);
      }
    },
  });

  const handleEdit = (product: any) => {
    setSelectedProduct(product);
    setEditForm({
      tenantId: product.tenantId,
      sku: product.sku,
      description: product.description || "",
      category: product.category || "",
      gtin: product.gtin || "",
      anvisaRegistry: product.anvisaRegistry || "",
      therapeuticClass: product.therapeuticClass || "",
      manufacturer: product.manufacturer || "",
      unitOfMeasure: product.unitOfMeasure || "UN",
      unitsPerBox: product.unitsPerBox || 0,
      minQuantity: product.minQuantity || 0,
      dispensingQuantity: product.dispensingQuantity || 1,
      storageCondition: product.storageCondition || "ambient",
      requiresBatchControl: product.requiresBatchControl ?? true,
      requiresExpiryControl: product.requiresExpiryControl ?? true,
      isControlledSubstance: product.isControlledSubstance ?? false,
      status: product.status || "active",
    });
    setEditDialogOpen(true);
  };

  const handleDelete = (product: any) => {
    setSelectedProduct(product);
    setDeleteDialogOpen(true);
  };

  const handleUpdateSubmit = () => {
    if (!selectedProduct) return;
    updateMutation.mutate({
      id: selectedProduct.id,
      ...editForm,
    });
  };

  const handleDeleteConfirm = () => {
    if (!selectedProduct) return;
    deleteMutation.mutate({ id: selectedProduct.id });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked && products) {
      setSelectedIds(products.map((p: any) => p.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, id]);
    } else {
      setSelectedIds(selectedIds.filter(selectedId => selectedId !== id));
    }
  };

  const handleBulkDelete = () => {
    setBulkDeleteDialogOpen(true);
  };

  const handleBulkDeleteConfirm = () => {
    deleteManyMutation.mutate({ ids: selectedIds });
  };

  const getStorageConditionBadge = (condition: string) => {
    const colors = {
      ambient: "bg-green-100 text-green-800",
      refrigerated_2_8: "bg-blue-100 text-blue-800",
      frozen_minus_20: "bg-cyan-100 text-cyan-800",
      controlled: "bg-purple-100 text-purple-800",
    };
    const labels = {
      ambient: "Ambiente",
      refrigerated_2_8: "Refrigerado 2-8°C",
      frozen_minus_20: "Congelado -20°C",
      controlled: "Controlado",
    };
    return (
      <Badge className={colors[condition as keyof typeof colors] || colors.ambient}>
        {labels[condition as keyof typeof labels] || condition}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      active: "bg-green-100 text-green-800",
      inactive: "bg-gray-100 text-gray-800",
      discontinued: "bg-red-100 text-red-800",
    };
    const labels = {
      active: "Ativo",
      inactive: "Inativo",
      discontinued: "Descontinuado",
    };
    return (
      <Badge className={colors[status as keyof typeof colors] || colors.active}>
        {labels[status as keyof typeof labels] || status}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={<Package className="w-8 h-8" />}
        title="Produtos"
        description="Gestão de produtos e medicamentos"
      />

      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-2xl font-bold">Produtos Cadastrados</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {products?.length || 0} produto(s)
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedIds.length > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleBulkDelete}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir Selecionados ({selectedIds.length})
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Importar Excel
                  </Button>
                <CreateProductDialog />
              </div>
            </div>

            {/* Barra de Filtros */}
            <div className="flex flex-wrap gap-3 mb-5 p-4 bg-muted/40 rounded-lg border">
              {/* Filtro: Cliente */}
              <div className="flex flex-col gap-1 min-w-[180px]">
                <span className="text-xs font-medium text-muted-foreground">Cliente</span>
                <Select
                  value={filterTenantId ? String(filterTenantId) : "all"}
                  onValueChange={(v) => {
                    setFilterTenantId(v === "all" ? undefined : Number(v));
                    setFilterCategory(""); // resetar categoria ao trocar cliente
                  }}
                >
                  <SelectTrigger className="h-9 bg-background">
                    <SelectValue placeholder="Todos os clientes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os clientes</SelectItem>
                    {(tenants ?? []).map((t: any) => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Filtro: SKU */}
              <div className="flex flex-col gap-1 min-w-[180px]">
                <span className="text-xs font-medium text-muted-foreground">SKU</span>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="h-9 pl-8 bg-background"
                    placeholder="Buscar por SKU..."
                    value={filterSku}
                    onChange={(e) => setFilterSku(e.target.value)}
                  />
                  {filterSku && (
                    <button
                      className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                      onClick={() => setFilterSku("")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Filtro: Categoria */}
              <div className="flex flex-col gap-1 min-w-[180px]">
                <span className="text-xs font-medium text-muted-foreground">Categoria</span>
                <Select
                  value={filterCategory || "all"}
                  onValueChange={(v) => setFilterCategory(v === "all" ? "" : v)}
                >
                  <SelectTrigger className="h-9 bg-background">
                    <SelectValue placeholder="Todas as categorias" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as categorias</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Limpar filtros */}
              {hasFilters && (
                <div className="flex items-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setFilterTenantId(undefined);
                      setFilterSku("");
                      setFilterCategory("");
                    }}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Limpar filtros
                  </Button>
                </div>
              )}
            </div>

            {isLoading ? (
              <div className="text-center py-8">Carregando...</div>
            ) : !products || products.length === 0 ? (
              <div className="text-center py-12">
                <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Nenhum produto cadastrado
                </h3>
                <p className="text-gray-600 mb-4">
                  Comece criando seu primeiro produto
                </p>
                <CreateProductDialog />
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedIds.length === products?.length && products.length > 0}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Unidade</TableHead>
                      <TableHead>Qtd. Mínima</TableHead>
                      <TableHead>Armazenagem</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product: any) => (
                      <TableRow key={product.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.includes(product.id)}
                            onCheckedChange={(checked) => handleSelectOne(product.id, checked as boolean)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{product.sku}</TableCell>
                        <TableCell className="max-w-xs truncate">{product.description}</TableCell>
                        <TableCell>{product.category || "-"}</TableCell>
                        <TableCell>{product.unitOfMeasure}</TableCell>
                        <TableCell>{product.minQuantity || 0}</TableCell>
                        <TableCell>{getStorageConditionBadge(product.storageCondition)}</TableCell>
                        <TableCell>{getStatusBadge(product.status)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(product)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(product)}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal de Edição */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Produto</DialogTitle>
            <DialogDescription>
              Atualize as informações do produto {selectedProduct?.sku}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-4 py-4">
            {/* Cliente */}
            <div className="col-span-2">
              <Label htmlFor="edit-tenant">Cliente</Label>
              <Select
                value={editForm.tenantId.toString()}
                onValueChange={(value) => setEditForm({ ...editForm, tenantId: parseInt(value) })}
              >
                <SelectTrigger id="edit-tenant">
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

            {/* SKU e Categoria */}
            <div>
              <Label htmlFor="edit-sku">SKU *</Label>
              <Input
                id="edit-sku"
                value={editForm.sku}
                onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })}
                placeholder="Ex: MED-001"
              />
            </div>
            <div>
              <Label htmlFor="edit-category">Categoria</Label>
              <Input
                id="edit-category"
                value={editForm.category}
                onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                placeholder="Ex: Analgésicos"
              />
            </div>

            {/* Descrição */}
            <div className="col-span-2">
              <Label htmlFor="edit-description">Descrição *</Label>
              <Textarea
                id="edit-description"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="Descrição completa do produto"
                rows={3}
              />
            </div>

            {/* Unidade de Medida e Quantidade Mínima */}
            <div>
              <Label htmlFor="edit-unit">Unidade de Medida</Label>
              <Select
                value={editForm.unitOfMeasure}
                onValueChange={(value) => setEditForm({ ...editForm, unitOfMeasure: value })}
              >
                <SelectTrigger id="edit-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UN">Unidade (UN)</SelectItem>
                  <SelectItem value="CX">Caixa (CX)</SelectItem>
                  <SelectItem value="KG">Quilograma (KG)</SelectItem>
                  <SelectItem value="L">Litro (L)</SelectItem>
                  <SelectItem value="M">Metro (M)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-minqty">Quantidade Mínima</Label>
              <Input
                id="edit-minqty"
                type="number"
                min="0"
                value={editForm.minQuantity}
                onChange={(e) => setEditForm({ ...editForm, minQuantity: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label htmlFor="edit-dispensing">Dispensação (unidades)</Label>
              <Input
                id="edit-dispensing"
                type="number"
                min="1"
                value={editForm.dispensingQuantity}
                onChange={(e) => setEditForm({ ...editForm, dispensingQuantity: parseInt(e.target.value) || 1 })}
                placeholder="Qtd. mínima de separação"
              />
            </div>
            <div>
              <Label htmlFor="edit-unitsPerBox">Unidades por Caixa</Label>
              <Input
                id="edit-unitsPerBox"
                type="number"
                min="1"
                value={editForm.unitsPerBox || ''}
                onChange={(e) => setEditForm({ ...editForm, unitsPerBox: parseInt(e.target.value) || undefined })}
                placeholder="Ex: 10"
              />
            </div>

            {/* Campos Farmacêuticos */}
            <div>
              <Label htmlFor="edit-gtin">GTIN/EAN</Label>
              <Input
                id="edit-gtin"
                value={editForm.gtin}
                onChange={(e) => setEditForm({ ...editForm, gtin: e.target.value })}
                placeholder="Código de barras"
              />
            </div>
            <div>
              <Label htmlFor="edit-anvisa">Registro ANVISA</Label>
              <Input
                id="edit-anvisa"
                value={editForm.anvisaRegistry}
                onChange={(e) => setEditForm({ ...editForm, anvisaRegistry: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="edit-manufacturer">Fabricante</Label>
              <Input
                id="edit-manufacturer"
                value={editForm.manufacturer}
                onChange={(e) => setEditForm({ ...editForm, manufacturer: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-therapeutic">Classe Terapêutica</Label>
              <Input
                id="edit-therapeutic"
                value={editForm.therapeuticClass}
                onChange={(e) => setEditForm({ ...editForm, therapeuticClass: e.target.value })}
              />
            </div>

            {/* Condição de Armazenagem */}
            <div>
              <Label htmlFor="edit-storage">Condição de Armazenagem</Label>
              <Select
                value={editForm.storageCondition}
                onValueChange={(value: any) => setEditForm({ ...editForm, storageCondition: value })}
              >
                <SelectTrigger id="edit-storage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ambient">Ambiente</SelectItem>
                  <SelectItem value="refrigerated_2_8">Refrigerado 2-8°C</SelectItem>
                  <SelectItem value="frozen_minus_20">Congelado -20°C</SelectItem>
                  <SelectItem value="controlled">Controlado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div>
              <Label htmlFor="edit-status">Status</Label>
              <Select
                value={editForm.status}
                onValueChange={(value: any) => setEditForm({ ...editForm, status: value })}
              >
                <SelectTrigger id="edit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                  <SelectItem value="discontinued">Descontinuado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Checkboxes de Controle */}
            <div className="col-span-2 space-y-3 pt-4 border-t">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="edit-batch"
                  checked={editForm.requiresBatchControl}
                  onCheckedChange={(checked) => setEditForm({ ...editForm, requiresBatchControl: checked as boolean })}
                />
                <Label htmlFor="edit-batch" className="font-normal cursor-pointer">
                  Requer controle de lote
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="edit-expiry"
                  checked={editForm.requiresExpiryControl}
                  onCheckedChange={(checked) => setEditForm({ ...editForm, requiresExpiryControl: checked as boolean })}
                />
                <Label htmlFor="edit-expiry" className="font-normal cursor-pointer">
                  Requer controle de validade
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="edit-controlled"
                  checked={editForm.isControlledSubstance}
                  onCheckedChange={(checked) => setEditForm({ ...editForm, isControlledSubstance: checked as boolean })}
                />
                <Label htmlFor="edit-controlled" className="font-normal cursor-pointer">
                  Substância controlada
                </Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateSubmit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação de Exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o produto "{selectedProduct?.sku}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal de Confirmação de Exclusão em Massa */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão em Massa</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Você está prestes a excluir <strong>{selectedIds.length} produto(s)</strong> permanentemente.
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                  <p className="text-sm text-amber-800 font-medium">
                    ⚠️ Atenção: Esta é uma exclusão PERMANENTE (hard delete)
                  </p>
                  <p className="text-sm text-amber-700 mt-1">
                    Os registros serão removidos completamente do banco de dados e não poderão ser recuperados.
                  </p>
                </div>
                <p className="text-sm">
                  A exclusão só será permitida se os produtos não tiverem inventário, pedidos ou movimentações associadas.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDeleteConfirm}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteManyMutation.isPending ? "Excluindo..." : `Excluir ${selectedIds.length} Produto(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal de Erros de Negócio */}
      {businessError.ErrorModal}

      {/* Dialog de Importação de Produtos */}
      <ImportProductsDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        tenants={(tenants ?? []) as { id: number; name: string }[]}
        defaultTenantId={filterTenantId}
        onSuccess={() => utils.products.list.invalidate()}
      />
    </div>
  );
}
