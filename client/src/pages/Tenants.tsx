import { PageHeader } from "@/components/PageHeader";
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
import { trpc } from "@/lib/trpc";
import { FileText, Pencil, Trash2 } from "lucide-react";
import { CreateTenantDialog } from "@/components/CreateTenantDialog";
import { toast } from "sonner";
import { useState } from "react";

export default function Tenants() {
  const { data: tenants, isLoading } = trpc.tenants.list.useQuery();
  const utils = trpc.useUtils();
  
  // Estados de seleção múltipla
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    cnpj: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    pickingRule: "FIFO" as "FIFO" | "FEFO" | "Direcionado",
    status: "active" as "active" | "inactive" | "suspended",
  });

  const updateMutation = trpc.tenants.update.useMutation({
    onSuccess: () => {
      toast.success("Cliente atualizado com sucesso!");
      utils.tenants.list.invalidate();
      setEditDialogOpen(false);
    },
    onError: (error) => {
      toast.error("Erro ao atualizar cliente: " + error.message);
    },
  });

  const deleteMutation = trpc.tenants.delete.useMutation({
    onSuccess: () => {
      toast.success("Cliente excluído com sucesso!");
      utils.tenants.list.invalidate();
      setDeleteDialogOpen(false);
    },
    onError: (error) => {
      toast.error("Erro ao excluir cliente: " + error.message);
    },
  });

  const deleteManyMutation = trpc.tenants.deleteMany.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.deletedCount} cliente(s) excluído(s) com sucesso!`);
      utils.tenants.list.invalidate();
      setSelectedIds([]);
      setBulkDeleteDialogOpen(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleEdit = (tenant: any) => {
    setSelectedTenant(tenant);
    setEditForm({
      name: tenant.name || "",
      cnpj: tenant.cnpj || "",
      email: tenant.email || "",
      phone: tenant.phone || "",
      address: tenant.address || "",
      city: tenant.city || "",
      state: tenant.state || "",
      zipCode: tenant.zipCode || "",
      pickingRule: tenant.pickingRule || "FIFO",
      status: tenant.status || "active",
    });
    setEditDialogOpen(true);
  };

  const handleDelete = (tenant: any) => {
    setSelectedTenant(tenant);
    setDeleteDialogOpen(true);
  };

  const handleUpdateSubmit = () => {
    if (!selectedTenant) return;
    
    // Validações
    if (!editForm.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    if (!editForm.cnpj.trim()) {
      toast.error("CNPJ é obrigatório");
      return;
    }
    if (editForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editForm.email)) {
      toast.error("Email inválido");
      return;
    }
    
    updateMutation.mutate({
      id: selectedTenant.id,
      ...editForm,
    });
  };

  const handleDeleteConfirm = () => {
    if (!selectedTenant) return;
    deleteMutation.mutate({ id: selectedTenant.id });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked && tenants) {
      setSelectedIds(tenants.map(t => t.id));
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

  const getPickingRuleBadge = (rule: string) => {
    const colors = {
      FIFO: "bg-blue-100 text-blue-800",
      FEFO: "bg-green-100 text-green-800",
      Direcionado: "bg-purple-100 text-purple-800",
    };
    return colors[rule as keyof typeof colors] || "bg-gray-100 text-gray-800";
  };

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={<FileText className="h-8 w-8" />}
        title="Clientes"
        description="Gestão de clientes e contratos"
      />

      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold">Clientes Cadastrados</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {tenants?.length || 0} cliente(s)
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
                <CreateTenantDialog />
              </div>
            </div>

            {isLoading ? (
              <div className="text-center py-8">Carregando...</div>
            ) : !tenants || tenants.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Nenhum cliente cadastrado
                </h3>
                <p className="text-gray-600 mb-4">
                  Comece criando seu primeiro cliente
                </p>
                <CreateTenantDialog />
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedIds.length === tenants?.length && tenants.length > 0}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>CNPJ</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Cidade/UF</TableHead>
                      <TableHead>Regra de Picking</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenants.map((tenant) => (
                      <TableRow key={tenant.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.includes(tenant.id)}
                            onCheckedChange={(checked) => handleSelectOne(tenant.id, checked as boolean)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{tenant.name}</TableCell>
                        <TableCell>{tenant.cnpj || "-"}</TableCell>
                        <TableCell>{tenant.email || "-"}</TableCell>
                        <TableCell>{tenant.phone || "-"}</TableCell>
                        <TableCell>
                          {tenant.city && tenant.state
                            ? `${tenant.city}/${tenant.state}`
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={getPickingRuleBadge(tenant.pickingRule || "FIFO")}
                          >
                            {tenant.pickingRule || "FIFO"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              tenant.status === "active"
                                ? "default"
                                : tenant.status === "inactive"
                                ? "secondary"
                                : "destructive"
                            }
                          >
                            {tenant.status === "active"
                              ? "Ativo"
                              : tenant.status === "inactive"
                              ? "Inativo"
                              : "Suspenso"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(tenant)}
                              title="Editar cliente"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(tenant)}
                              title="Excluir cliente"
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
            <DialogDescription>
              Atualize os dados do cliente
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nome *</Label>
                <Input
                  id="edit-name"
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                  placeholder="Nome do cliente"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-cnpj">CNPJ *</Label>
                <Input
                  id="edit-cnpj"
                  value={editForm.cnpj}
                  onChange={(e) =>
                    setEditForm({ ...editForm, cnpj: e.target.value })
                  }
                  placeholder="00.000.000/0000-00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) =>
                    setEditForm({ ...editForm, email: e.target.value })
                  }
                  placeholder="contato@empresa.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-phone">Telefone</Label>
                <Input
                  id="edit-phone"
                  value={editForm.phone}
                  onChange={(e) =>
                    setEditForm({ ...editForm, phone: e.target.value })
                  }
                  placeholder="(11) 99999-9999"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-address">Endereço</Label>
              <Input
                id="edit-address"
                value={editForm.address}
                onChange={(e) =>
                  setEditForm({ ...editForm, address: e.target.value })
                }
                placeholder="Rua, número, complemento"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-city">Cidade</Label>
                <Input
                  id="edit-city"
                  value={editForm.city}
                  onChange={(e) =>
                    setEditForm({ ...editForm, city: e.target.value })
                  }
                  placeholder="São Paulo"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-state">Estado</Label>
                <Input
                  id="edit-state"
                  value={editForm.state}
                  onChange={(e) =>
                    setEditForm({ ...editForm, state: e.target.value.toUpperCase() })
                  }
                  placeholder="SP"
                  maxLength={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-zipCode">CEP</Label>
                <Input
                  id="edit-zipCode"
                  value={editForm.zipCode}
                  onChange={(e) =>
                    setEditForm({ ...editForm, zipCode: e.target.value })
                  }
                  placeholder="00000-000"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-pickingRule">Regra de Picking *</Label>
                <Select
                  value={editForm.pickingRule}
                  onValueChange={(value: any) =>
                    setEditForm({ ...editForm, pickingRule: value })
                  }
                >
                  <SelectTrigger id="edit-pickingRule">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIFO">FIFO (First In, First Out)</SelectItem>
                    <SelectItem value="FEFO">FEFO (First Expired, First Out)</SelectItem>
                    <SelectItem value="Direcionado">Direcionado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-status">Status *</Label>
                <Select
                  value={editForm.status}
                  onValueChange={(value: any) =>
                    setEditForm({ ...editForm, status: value })
                  }
                >
                  <SelectTrigger id="edit-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                    <SelectItem value="suspended">Suspenso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUpdateSubmit}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? "Salvando..." : "Salvar"}
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
              Tem certeza que deseja excluir o cliente "{selectedTenant?.name}"?
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
                  Você está prestes a excluir <strong>{selectedIds.length} cliente(s)</strong> permanentemente.
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
                  A exclusão só será permitida se os clientes não tiverem produtos, contratos ou usuários associados.
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
              {deleteManyMutation.isPending ? "Excluindo..." : `Excluir ${selectedIds.length} Cliente(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
