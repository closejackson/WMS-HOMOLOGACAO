import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Users as UsersIcon, Pencil, Shield, User as UserIcon, Building2, Search, UserPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PortalClientUsersSection } from "@/components/PortalClientUsersSection";

export default function Users() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"admin" | "user" | undefined>(undefined);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userToDelete, setUserToDelete] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    role: "user" as "admin" | "user",
    tenantId: null as number | null,
  });
  const [createFormData, setCreateFormData] = useState({
    name: "",
    email: "",
    role: "user" as "admin" | "user",
    tenantId: null as number | null,
    roleIds: [] as number[],
  });

  const utils = trpc.useUtils();

  // Queries
  const { data: users, isLoading } = trpc.users.list.useQuery({
    search: search || undefined,
    role: roleFilter,
  });

  const { data: tenants } = trpc.tenants.list.useQuery();
  const { data: stats } = trpc.users.stats.useQuery();
  const { data: roles } = trpc.roles.listRoles.useQuery({ includeInactive: false });

  // Mutations
  const createUserMutation = trpc.users.create.useMutation({
    onSuccess: () => {
      toast.success("Usuário criado com sucesso");
      utils.users.list.invalidate();
      utils.users.stats.invalidate();
      setCreateDialogOpen(false);
      setCreateFormData({
        name: "",
        email: "",
        role: "user",
        tenantId: null,
        roleIds: [],
      });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateUserMutation = trpc.users.update.useMutation({
    onSuccess: () => {
      toast.success("Usuário atualizado com sucesso");
      utils.users.list.invalidate();
      utils.users.stats.invalidate();
      setEditDialogOpen(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteUserMutation = trpc.users.delete.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      utils.users.list.invalidate();
      utils.users.stats.invalidate();
      setDeleteDialogOpen(false);
      setUserToDelete(null);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleEdit = (user: any) => {
    setSelectedUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    });
    setEditDialogOpen(true);
  };

  const handleCreateSubmit = () => {
    if (!createFormData.name || !createFormData.email) {
      toast.error("Nome e email são obrigatórios");
      return;
    }

    createUserMutation.mutate(createFormData);
  };

  const handleUpdateSubmit = () => {
    if (!selectedUser) return;

    updateUserMutation.mutate({
      id: selectedUser.id,
      ...formData,
    });
  };

  const handleDelete = (user: any) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!userToDelete) return;
    deleteUserMutation.mutate({ id: userToDelete.id });
  };

  const getRoleBadge = (role: string) => {
    if (role === "admin") {
      return (
        <Badge variant="default" className="bg-purple-600">
          <Shield className="w-3 h-3 mr-1" />
          Admin
        </Badge>
      );
    }
    return (
      <Badge variant="outline">
        <UserIcon className="w-3 h-3 mr-1" />
        Usuário
      </Badge>
    );
  };

  const getLoginMethodBadge = (method: string) => {
    const methods: Record<string, { label: string; color: string }> = {
      google: { label: "Google", color: "bg-blue-500" },
      github: { label: "GitHub", color: "bg-gray-800" },
      email: { label: "Email", color: "bg-green-600" },
    };

    const config = methods[method] || { label: method, color: "bg-gray-500" };

    return (
      <Badge className={`${config.color} text-white`}>
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={<UsersIcon className="h-8 w-8" />}
        title="Usuários"
        description="Gerenciamento de usuários cadastrados no sistema"
      />

      <main className="container mx-auto px-6 py-8">
        {/* Statistics Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Total de Usuários</CardDescription>
                <CardTitle className="text-3xl">{stats.totalUsers}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Administradores</CardDescription>
                <CardTitle className="text-3xl text-purple-600">{stats.adminCount}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Usuários Comuns</CardDescription>
                <CardTitle className="text-3xl text-blue-600">{stats.userCount}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Com Cliente</CardDescription>
                <CardTitle className="text-3xl text-green-600">{stats.usersWithTenant}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Sem Cliente</CardDescription>
                <CardTitle className="text-3xl text-orange-600">{stats.usersWithoutTenant}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        )}

        {/* Filters and Actions */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Buscar por nome ou email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select
                value={roleFilter || "all"}
                onValueChange={(value) => setRoleFilter(value === "all" ? undefined : value as "admin" | "user")}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filtrar por role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="admin">Administradores</SelectItem>
                  <SelectItem value="user">Usuários</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => setCreateDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700">
                <UserPlus className="w-4 h-4 mr-2" />
                Novo Usuário
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card>
          <CardContent className="p-6">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Usuários Cadastrados
              </h3>
              <p className="text-sm text-gray-600">
                {users?.length || 0} usuário(s) encontrado(s)
              </p>
            </div>

            {isLoading ? (
              <div className="text-center py-16">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                  <UsersIcon className="h-8 w-8 text-gray-400 animate-pulse" />
                </div>
                <p className="text-sm text-gray-600">Carregando usuários...</p>
              </div>
            ) : users && users.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Login</TableHead>
                    <TableHead>Último Acesso</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell className="text-gray-600">{user.email}</TableCell>
                      <TableCell>{getRoleBadge(user.role)}</TableCell>
                      <TableCell>
                        {user.tenantName ? (
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-gray-400" />
                            <span>{user.tenantName}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">Sem cliente</span>
                        )}
                      </TableCell>
                      <TableCell>{getLoginMethodBadge(user.loginMethod || "email")}</TableCell>
                      <TableCell className="text-gray-600 text-sm">
                        {user.lastSignedIn
                          ? new Date(user.lastSignedIn).toLocaleString("pt-BR")
                          : "Nunca"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(user)}
                            title="Editar usuário"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(user)}
                            title="Excluir usuário"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-16">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                  <UsersIcon className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Nenhum usuário encontrado
                </h3>
                <p className="text-sm text-gray-600">
                  {search || roleFilter
                    ? "Tente ajustar os filtros de busca"
                    : "Nenhum usuário cadastrado no sistema"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Portal Client Users Section */}
      <PortalClientUsersSection />

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Criar Novo Usuário</DialogTitle>
            <DialogDescription>
              Preencha as informações para criar um novo usuário no sistema
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="create-name">Nome *</Label>
              <Input
                id="create-name"
                placeholder="Nome completo do usuário"
                value={createFormData.name}
                onChange={(e) => setCreateFormData({ ...createFormData, name: e.target.value })}
              />
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="create-email">Email *</Label>
              <Input
                id="create-email"
                type="email"
                placeholder="email@exemplo.com"
                value={createFormData.email}
                onChange={(e) => setCreateFormData({ ...createFormData, email: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-role">Tipo de Usuário</Label>
              <Select
                value={createFormData.role}
                onValueChange={(value) => setCreateFormData({ ...createFormData, role: value as "admin" | "user" })}
              >
                <SelectTrigger id="create-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Usuário</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-tenant">Cliente</Label>
              <Select
                value={createFormData.tenantId?.toString() ?? "none"}
                onValueChange={(value) =>
                  setCreateFormData({ ...createFormData, tenantId: value === "none" ? null : parseInt(value) })
                }
              >
                <SelectTrigger id="create-tenant">
                  <SelectValue placeholder="Selecione um cliente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem cliente</SelectItem>
                  {tenants?.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id.toString()}>
                      {tenant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-3">
              <div>
                <Label>Perfis de Acesso (RBAC)</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Selecione um ou mais perfis para atribuir ao usuário
                </p>
              </div>
              <div className="border rounded-lg p-4 space-y-3 max-h-64 overflow-y-auto">
                {roles && roles.length > 0 ? (
                  roles.map((role) => (
                    <div key={role.id} className="flex items-start space-x-3">
                      <Checkbox
                        id={`role-${role.id}`}
                        checked={createFormData.roleIds.includes(role.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setCreateFormData({
                              ...createFormData,
                              roleIds: [...createFormData.roleIds, role.id],
                            });
                          } else {
                            setCreateFormData({
                              ...createFormData,
                              roleIds: createFormData.roleIds.filter((id) => id !== role.id),
                            });
                          }
                        }}
                      />
                      <div className="flex-1">
                        <label
                          htmlFor={`role-${role.id}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                        >
                          {role.name}
                        </label>
                        <p className="text-xs text-muted-foreground mt-1">
                          {role.permissionCount} permissões
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum perfil disponível
                  </p>
                )}
              </div>
              {createFormData.roleIds.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  <strong>{createFormData.roleIds.length}</strong> perfil(is) selecionado(s)
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateSubmit} disabled={createUserMutation.isPending}>
              {createUserMutation.isPending ? "Criando..." : "Criar Usuário"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>
              Atualize as informações do usuário selecionado
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="edit-name">Nome</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select
                value={formData.role}
                onValueChange={(value) => setFormData({ ...formData, role: value as "admin" | "user" })}
              >
                <SelectTrigger id="edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Usuário</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-tenant">Cliente</Label>
              <Select
                value={formData.tenantId?.toString() ?? "none"}
                onValueChange={(value) =>
                  setFormData({ ...formData, tenantId: value === "none" ? null : parseInt(value) })
                }
              >
                <SelectTrigger id="edit-tenant">
                  <SelectValue placeholder="Selecione um cliente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem cliente</SelectItem>
                  {tenants?.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id.toString()}>
                      {tenant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateSubmit} disabled={updateUserMutation.isPending}>
              {updateUserMutation.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o usuário <strong>{userToDelete?.name}</strong>?
              <br />
              <br />
              Esta ação não pode ser desfeita. Todos os dados e associações de perfis deste usuário serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteUserMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteUserMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteUserMutation.isPending ? "Excluindo..." : "Excluir Usuário"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
