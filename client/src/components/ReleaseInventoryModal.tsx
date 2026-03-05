/**
 * ReleaseInventoryModal
 *
 * Modal de liberação gerencial para itens com status "blocked" ou "quarantine".
 *
 * Semântica:
 *  - blocked    : impede entrada E saída → requer autenticação de admin para qualquer movimentação
 *  - quarantine : permite entrada, impede saída → requer autenticação de admin para saída
 *
 * Fluxo:
 *  1. O sistema detecta o erro RESTRICTED_STATUS ao tentar mover o item.
 *  2. Este modal é exibido com o motivo do bloqueio.
 *  3. O admin insere login + senha + motivo da liberação.
 *  4. O backend autentica e libera o item (status → available) via releaseInventory.
 *  5. O callback onReleased é chamado para que o fluxo original seja retentado.
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Alert, AlertDescription } from "./ui/alert";
import { ShieldAlert, Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";

interface ReleaseInventoryModalProps {
  open: boolean;
  onClose: () => void;
  /** Chamado após liberação bem-sucedida para retentar a operação original */
  onReleased: () => void;
  /** Status que gerou o bloqueio: "blocked" | "quarantine" */
  restrictedStatus: "blocked" | "quarantine";
  /** Identificador do item: inventoryId ou labelCode */
  inventoryId?: number;
  labelCode?: string;
  /** Descrição contextual do item bloqueado (ex: SKU + lote) */
  itemDescription?: string;
}

export function ReleaseInventoryModal({
  open,
  onClose,
  onReleased,
  restrictedStatus,
  inventoryId,
  labelCode,
  itemDescription,
}: ReleaseInventoryModalProps) {
  const [adminLogin, setAdminLogin] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [reason, setReason] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const releaseMutation = trpc.blindConference.releaseInventory.useMutation({
    onSuccess: (data) => {
      toast.success(
        `Estoque liberado por ${data.authorizedBy}. ${data.releasedCount} registro(s) liberado(s).`
      );
      handleClose();
      onReleased();
    },
    onError: (err) => {
      setError(err.message || "Erro ao liberar estoque.");
    },
  });

  const handleClose = () => {
    setAdminLogin("");
    setAdminPassword("");
    setReason("");
    setError(null);
    onClose();
  };

  const handleSubmit = () => {
    setError(null);
    if (!adminLogin.trim() || !adminPassword.trim()) {
      setError("Informe login e senha do administrador.");
      return;
    }
    if (!reason.trim()) {
      setError("Informe o motivo da liberação.");
      return;
    }
    if (!inventoryId && !labelCode) {
      setError("Identificador do item não fornecido.");
      return;
    }
    releaseMutation.mutate({
      inventoryId,
      labelCode,
      adminLogin: adminLogin.trim(),
      adminPassword: adminPassword.trim(),
      reason: reason.trim(),
    });
  };

  const statusLabel =
    restrictedStatus === "blocked" ? "Bloqueado" : "Quarentena / NCG";
  const statusColor =
    restrictedStatus === "blocked"
      ? "text-red-700 bg-red-50 border-red-200"
      : "text-orange-700 bg-orange-50 border-orange-200";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-600" />
            Liberação Gerencial de Estoque
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status do item */}
          <Alert className={statusColor}>
            <Lock className="h-4 w-4" />
            <AlertDescription>
              <span className="font-semibold">Status: {statusLabel}</span>
              {itemDescription && (
                <p className="mt-1 text-sm opacity-80">{itemDescription}</p>
              )}
              {restrictedStatus === "blocked" ? (
                <p className="mt-1 text-xs">
                  Este item está <strong>Bloqueado</strong> — entrada e saída
                  impedidas até liberação gerencial.
                </p>
              ) : (
                <p className="mt-1 text-xs">
                  Este item está em <strong>Quarentena / NCG</strong> — saída
                  impedida até liberação gerencial.
                </p>
              )}
            </AlertDescription>
          </Alert>

          {/* Credenciais do admin */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">
              Autenticação do Administrador
            </p>

            <div className="space-y-1">
              <Label htmlFor="adminLogin">Login</Label>
              <Input
                id="adminLogin"
                value={adminLogin}
                onChange={(e) => setAdminLogin(e.target.value)}
                placeholder="Login do administrador"
                autoComplete="username"
                disabled={releaseMutation.isPending}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="adminPassword">Senha</Label>
              <div className="relative">
                <Input
                  id="adminPassword"
                  type={showPassword ? "text" : "password"}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  placeholder="Senha do administrador"
                  autoComplete="current-password"
                  disabled={releaseMutation.isPending}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="reason">Motivo da Liberação</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Descreva o motivo da liberação (obrigatório)"
                rows={2}
                disabled={releaseMutation.isPending}
              />
            </div>
          </div>

          {/* Erro */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={releaseMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={releaseMutation.isPending}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {releaseMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Autenticando...
              </>
            ) : (
              <>
                <ShieldAlert className="h-4 w-4 mr-2" />
                Liberar Estoque
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
