/**
 * PortalClientUsersSection.tsx
 * 
 * Seção para gerenciar usuários do Portal do Cliente (systemUsers)
 * Exibe solicitações pendentes e permite aprovação/rejeição
 */

import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { CheckCircle2, XCircle, Clock, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export function PortalClientUsersSection() {
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");

  const utils = trpc.useUtils();

  // Queries
  const { data: pendingUsers, isLoading } = trpc.clientPortal.listPendingUsers.useQuery();
  const { data: tenants } = trpc.tenants.list.useQuery();

  // Mutations
  const approveMutation = trpc.clientPortal.approveUser.useMutation({
    onSuccess: () => {
      toast.success("Usuário aprovado com sucesso!");
      utils.clientPortal.listPendingUsers.invalidate();
      setApproveDialogOpen(false);
      setSelectedUser(null);
      setSelectedTenantId("");
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao aprovar usuário");
    },
  });

  const rejectMutation = trpc.clientPortal.rejectUser.useMutation({
    onSuccess: () => {
      toast.success("Solicitação rejeitada");
      utils.clientPortal.listPendingUsers.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao rejeitar usuário");
    },
  });

  const handleApprove = (user: any) => {
    setSelectedUser(user);
    setApproveDialogOpen(true);
  };

  const handleConfirmApprove = () => {
    if (!selectedUser || !selectedTenantId) {
      toast.error("Selecione um cliente para atribuir ao usuário");
      return;
    }

    approveMutation.mutate({
      userId: selectedUser.id,
      tenantId: parseInt(selectedTenantId),
    });
  };

  const handleReject = (user: any) => {
    if (confirm(`Tem certeza que deseja rejeitar a solicitação de ${user.fullName}?`)) {
      rejectMutation.mutate({
        userId: user.id,
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
            <Clock className="w-3 h-3 mr-1" />
            Pendente
          </Badge>
        );
      case "approved":
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Aprovado
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
            <XCircle className="w-3 h-3 mr-1" />
            Rejeitado
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (!pendingUsers || pendingUsers.length === 0) {
    return null; // Não exibir seção se não houver solicitações pendentes
  }

  return (
    <div className="container mx-auto px-6 py-8">
      <Card className="border-yellow-200 bg-yellow-50/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-yellow-600" />
                Solicitações de Acesso ao Portal do Cliente
              </CardTitle>
              <CardDescription className="mt-2">
                Usuários aguardando aprovação para acessar o Portal do Cliente
              </CardDescription>
            </div>
            <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300 text-lg px-3 py-1">
              {pendingUsers.length} {pendingUsers.length === 1 ? "pendente" : "pendentes"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-600">Carregando solicitações...</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome Completo</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Login</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data da Solicitação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingUsers.map((user) => (
                  <TableRow key={user.id} className="bg-white">
                    <TableCell className="font-medium">{user.fullName}</TableCell>
                    <TableCell className="text-gray-600">{user.email}</TableCell>
                    <TableCell className="text-gray-600 font-mono text-sm">{user.login}</TableCell>
                    <TableCell>{getStatusBadge(user.approvalStatus)}</TableCell>
                    <TableCell className="text-gray-600 text-sm">
                      {new Date(user.createdAt).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApprove(user)}
                          className="bg-green-600 hover:bg-green-700 text-white"
                          disabled={approveMutation.isPending}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReject(user)}
                          className="border-red-300 text-red-600 hover:bg-red-50"
                          disabled={rejectMutation.isPending}
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Rejeitar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Approve Dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprovar Acesso ao Portal</DialogTitle>
            <DialogDescription>
              Atribua um cliente ao usuário <strong>{selectedUser?.fullName}</strong> para liberar o acesso
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="tenant">Cliente (Tenant) *</Label>
              <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                <SelectTrigger id="tenant">
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
              <p className="text-xs text-gray-500">
                O usuário terá acesso apenas aos dados deste cliente
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>Informações do Usuário:</strong>
              </p>
              <ul className="mt-2 space-y-1 text-sm text-blue-700">
                <li>• Nome: {selectedUser?.fullName}</li>
                <li>• Email: {selectedUser?.email}</li>
                <li>• Login: {selectedUser?.login}</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setApproveDialogOpen(false);
                setSelectedUser(null);
                setSelectedTenantId("");
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmApprove}
              disabled={!selectedTenantId || approveMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {approveMutation.isPending ? "Aprovando..." : "Aprovar Acesso"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
