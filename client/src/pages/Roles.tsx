import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Users, Lock, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function Roles() {
  const [expandedRoles, setExpandedRoles] = useState<Set<number>>(new Set());
  const [selectedUser, setSelectedUser] = useState<number | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([]);

  // Queries
  const { data: roles = [], isLoading: loadingRoles } = trpc.roles.listRoles.useQuery({
    includeInactive: false,
  });

  const { data: users = [], isLoading: loadingUsers } = trpc.users.list.useQuery({});

  const { data: userRoles = [], refetch: refetchUserRoles } = trpc.roles.getUserRoles.useQuery(
    { userId: selectedUser! },
    { enabled: !!selectedUser }
  );

  // Mutations
  const assignRolesMutation = trpc.roles.assignRolesToUser.useMutation({
    onSuccess: () => {
      toast.success("Perfis atualizados com sucesso!");
      refetchUserRoles();
      setSelectedUser(null);
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar perfis: ${error.message}`);
    },
  });

  const toggleRole = (roleId: number) => {
    const newExpanded = new Set(expandedRoles);
    if (newExpanded.has(roleId)) {
      newExpanded.delete(roleId);
    } else {
      newExpanded.add(roleId);
    }
    setExpandedRoles(newExpanded);
  };

  const handleOpenUserDialog = (userId: number) => {
    setSelectedUser(userId);
    // Buscar perfis atuais do usuário
    const currentRoles = userRoles.map(ur => ur.role.id);
    setSelectedRoleIds(currentRoles);
  };

  const handleSaveUserRoles = () => {
    if (!selectedUser) return;

    assignRolesMutation.mutate({
      userId: selectedUser,
      roleIds: selectedRoleIds,
    });
  };

  const toggleRoleSelection = (roleId: number) => {
    setSelectedRoleIds(prev =>
      prev.includes(roleId)
        ? prev.filter(id => id !== roleId)
        : [...prev, roleId]
    );
  };

  const getRoleColor = (roleCode: string) => {
    const colors: Record<string, string> = {
      ADMIN: "bg-red-500",
      RECEIVING_MANAGER: "bg-blue-500",
      RECEIVING_OPERATOR: "bg-blue-400",
      PICKING_MANAGER: "bg-green-500",
      PICKING_OPERATOR: "bg-green-400",
      STOCK_ANALYST: "bg-purple-500",
      TENANT_OPERATOR: "bg-orange-500",
    };
    return colors[roleCode] || "bg-gray-500";
  };

  const groupPermissionsByModule = (permissions: any[]) => {
    const grouped: Record<string, any[]> = {};
    permissions.forEach(perm => {
      if (!grouped[perm.module]) {
        grouped[perm.module] = [];
      }
      grouped[perm.module].push(perm);
    });
    return grouped;
  };

  if (loadingRoles || loadingUsers) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-white/70">Carregando perfis...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 text-white drop-shadow-lg">Perfis e Permissões</h1>
        <p className="text-white/70">
          Gerencie perfis de acesso e atribua permissões aos usuários
        </p>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Perfis</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{roles.length}</div>
            <p className="text-xs text-muted-foreground">Perfis ativos no sistema</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
            <p className="text-xs text-muted-foreground">Usuários cadastrados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Permissões Únicas</CardTitle>
            <Lock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">32</div>
            <p className="text-xs text-muted-foreground">Permissões granulares</p>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Perfis */}
      <div className="space-y-4 mb-8">
        <h2 className="text-2xl font-bold">Perfis Disponíveis</h2>
        {roles.map(role => (
          <RoleCard
            key={role.id}
            role={role}
            expanded={expandedRoles.has(role.id)}
            onToggle={() => toggleRole(role.id)}
            getRoleColor={getRoleColor}
            groupPermissionsByModule={groupPermissionsByModule}
          />
        ))}
      </div>

      {/* Lista de Usuários */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Atribuir Perfis a Usuários</h2>
        <Card>
          <CardHeader>
            <CardTitle>Usuários Cadastrados</CardTitle>
            <CardDescription>Clique em um usuário para gerenciar seus perfis</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {users.map(user => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent cursor-pointer"
                  onClick={() => handleOpenUserDialog(user.id)}
                >
                  <div>
                    <div className="font-medium">{user.name}</div>
                    <div className="text-sm text-muted-foreground">{user.email}</div>
                  </div>
                  <Button variant="outline" size="sm">
                    Gerenciar Perfis
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialog de Atribuição de Perfis */}
      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Gerenciar Perfis do Usuário</DialogTitle>
            <DialogDescription>
              Selecione os perfis que deseja atribuir ao usuário. Um usuário pode ter múltiplos perfis.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 max-h-[400px] overflow-y-auto">
            {roles.map(role => (
              <div key={role.id} className="flex items-start space-x-3 p-3 border rounded-lg">
                <Checkbox
                  id={`role-${role.id}`}
                  checked={selectedRoleIds.includes(role.id)}
                  onCheckedChange={() => toggleRoleSelection(role.id)}
                />
                <div className="flex-1">
                  <Label htmlFor={`role-${role.id}`} className="cursor-pointer">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={getRoleColor(role.code)}>{role.name}</Badge>
                      {role.isSystemRole && (
                        <Badge variant="outline" className="text-xs">Sistema</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{role.description}</p>
                  </Label>
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedUser(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveUserRoles} disabled={assignRolesMutation.isPending}>
              {assignRolesMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Componente auxiliar para exibir card de perfil
function RoleCard({
  role,
  expanded,
  onToggle,
  getRoleColor,
  groupPermissionsByModule,
}: {
  role: any;
  expanded: boolean;
  onToggle: () => void;
  getRoleColor: (code: string) => string;
  groupPermissionsByModule: (permissions: any[]) => Record<string, any[]>;
}) {
  const { data: permissions = [], isLoading } = trpc.roles.getRolePermissions.useQuery(
    { roleId: role.id },
    { enabled: expanded }
  );

  const groupedPermissions = expanded ? groupPermissionsByModule(permissions) : {};

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={onToggle}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
            <div>
              <div className="flex items-center gap-2">
                <Badge className={getRoleColor(role.code)}>{role.name}</Badge>
                {role.isSystemRole && (
                  <Badge variant="outline" className="text-xs">Sistema</Badge>
                )}
              </div>
              <CardDescription className="mt-1">{role.description}</CardDescription>
            </div>
          </div>
          <Badge variant="secondary">{role.permissionCount || 0} permissões</Badge>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando permissões...</div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedPermissions).map(([module, perms]) => (
                <div key={module}>
                  <h4 className="font-semibold text-sm mb-2 capitalize">{module}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {perms.map(perm => (
                      <div key={perm.id} className="flex items-start gap-2 text-sm">
                        <Lock className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <div className="font-medium">{perm.name}</div>
                          <div className="text-xs text-muted-foreground">{perm.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Separator className="mt-3" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
