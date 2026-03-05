/**
 * ClientPortalLogin.tsx
 *
 * Página de login do Portal do Cliente.
 * Rota: /portal/login
 *
 * Colocar em: client/src/pages/client/ClientPortalLogin.tsx
 */

import { useState } from "react";
import { useLocation, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Package, Eye, EyeOff, Loader2, Lock, User } from "lucide-react";
import { toast } from "sonner";

export function ClientPortalLogin() {
  const [, setLocation] = useLocation();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loginMutation = trpc.clientPortal.login.useMutation({
    onSuccess: (data) => {
      toast.success(`Bem-vindo, ${data.user.fullName.split(" ")[0]}!`);
      setLocation("/portal");
    },
    onError: (err) => {
      setErrorMsg(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!login.trim() || !password) return;
    loginMutation.mutate({ login: login.trim(), password });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {/* Decorative background circles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-slate-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl shadow-xl mb-4">
            <Package className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Med@x WMS</h1>
          <p className="text-slate-400 mt-1 text-sm">Portal do Cliente</p>
        </div>

        <Card className="shadow-2xl border-slate-700 bg-slate-800/80 backdrop-blur">
          <CardHeader className="pb-4">
            <CardTitle className="text-white text-xl">Entrar no Portal</CardTitle>
            <CardDescription className="text-slate-400">
              Acesse seus estoques e pedidos em tempo real
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {errorMsg && (
                <Alert variant="destructive" className="bg-red-950/50 border-red-800 text-red-300">
                  <AlertDescription>{errorMsg}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="login" className="text-slate-300 text-sm">
                  Login
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <Input
                    id="login"
                    type="text"
                    placeholder="Seu login de acesso"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    disabled={loginMutation.isPending}
                    autoComplete="username"
                    className="pl-9 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-300 text-sm">
                  Senha
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Sua senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loginMutation.isPending}
                    autoComplete="current-password"
                    className="pl-9 pr-9 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold h-11"
                disabled={loginMutation.isPending || !login.trim() || !password}
              >
                {loginMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  "Entrar"
                )}
              </Button>
            </form>

            <div className="mt-5 space-y-3">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-700" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-slate-800 px-2 text-slate-500">Primeiro acesso?</span>
                </div>
              </div>

              <Link href="/portal/primeiro-acesso">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white h-11"
                >
                  1º Acesso - Solicitar Cadastro
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-white/50 mt-6">
          © {new Date().getFullYear()} Med@x — Acesso restrito a clientes cadastrados
        </p>
      </div>
    </div>
  );
}
