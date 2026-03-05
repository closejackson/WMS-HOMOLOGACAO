/**
 * ClientPortalFirstAccess.tsx
 *
 * Página de primeiro acesso (auto-cadastro) do Portal do Cliente
 * Permite que novos usuários solicitem acesso ao portal
 */

import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Package, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export function ClientPortalFirstAccess() {
  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState({
    fullName: "",
    companyName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showSuccess, setShowSuccess] = useState(false);

  const registerMutation = trpc.clientPortal.registerNewUser.useMutation({
    onSuccess: () => {
      setShowSuccess(true);
      toast.success("Solicitação enviada com sucesso!");
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao enviar solicitação");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validações
    if (!formData.fullName || !formData.companyName || !formData.email || !formData.password) {
      toast.error("Por favor, preencha todos os campos");
      return;
    }

    if (formData.password.length < 8) {
      toast.error("A senha deve ter pelo menos 8 caracteres");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }

    // Enviar solicitação
    registerMutation.mutate({
      fullName: formData.fullName,
      companyName: formData.companyName,
      email: formData.email,
      password: formData.password,
    });
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (showSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-slate-700 bg-slate-800/50 backdrop-blur">
          <CardHeader className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-400" />
              </div>
            </div>
            <CardTitle className="text-2xl text-white">Solicitação Enviada!</CardTitle>
            <CardDescription className="text-slate-400 text-base">
              Sua solicitação foi registrada com sucesso
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-4">
              <p className="text-sm text-slate-300 text-center leading-relaxed">
                Em breve, você receberá a confirmação da liberação do seu usuário por email.
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-400 text-center">
                Aguarde a aprovação do administrador para acessar o portal.
              </p>

              <Link href="/portal/login">
                <Button variant="outline" className="w-full bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar para Login
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {/* Decorative background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-20 w-72 h-72 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-20 w-72 h-72 bg-slate-500/5 rounded-full blur-3xl" />
      </div>

      <Card className="relative w-full max-w-lg border-slate-700 bg-slate-800/50 backdrop-blur">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between">
            <Link href="/portal/login">
              <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white hover:bg-slate-700">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
            </Link>
            <div className="flex items-center justify-center w-12 h-12 bg-blue-600 rounded-2xl">
              <Package className="h-6 w-6 text-white" />
            </div>
          </div>

          <div>
            <CardTitle className="text-2xl text-white">Primeiro Acesso</CardTitle>
            <CardDescription className="text-slate-400 mt-2">
              Preencha o formulário para solicitar acesso ao Portal do Cliente
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Nome Completo */}
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-slate-300">
                Nome Completo <span className="text-red-400">*</span>
              </Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Digite seu nome completo"
                value={formData.fullName}
                onChange={(e) => handleChange("fullName", e.target.value)}
                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                required
              />
            </div>

            {/* Empresa */}
            <div className="space-y-2">
              <Label htmlFor="companyName" className="text-slate-300">
                Empresa <span className="text-red-400">*</span>
              </Label>
              <Input
                id="companyName"
                type="text"
                placeholder="Nome da sua empresa"
                value={formData.companyName}
                onChange={(e) => handleChange("companyName", e.target.value)}
                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                required
              />
              <p className="text-xs text-slate-500">
                Informe o nome da empresa que você representa
              </p>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-300">
                E-mail <span className="text-red-400">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="seu.email@empresa.com.br"
                value={formData.email}
                onChange={(e) => handleChange("email", e.target.value)}
                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                required
              />
            </div>

            {/* Senha */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300">
                Cadastre uma senha <span className="text-red-400">*</span>
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Mínimo 8 caracteres"
                value={formData.password}
                onChange={(e) => handleChange("password", e.target.value)}
                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                required
                minLength={8}
              />
              <p className="text-xs text-slate-500">
                Use pelo menos 8 caracteres com letras e números
              </p>
            </div>

            {/* Confirmar Senha */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-slate-300">
                Confirme a senha <span className="text-red-400">*</span>
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Digite a senha novamente"
                value={formData.confirmPassword}
                onChange={(e) => handleChange("confirmPassword", e.target.value)}
                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                required
                minLength={8}
              />
            </div>

            {/* Aviso */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <p className="text-sm text-blue-300 leading-relaxed">
                <strong>Importante:</strong> Sua solicitação será analisada por um administrador. 
                Você receberá um email assim que seu acesso for liberado.
              </p>
            </div>

            {/* Botão Submit */}
            <Button
              type="submit"
              className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              disabled={registerMutation.isPending}
            >
              {registerMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Solicitar Acesso"
              )}
            </Button>

            {/* Link para Login */}
            <p className="text-center text-sm text-slate-400">
              Já possui acesso?{" "}
              <Link href="/portal/login">
                <span className="text-blue-400 hover:text-blue-300 underline cursor-pointer">
                  Fazer login
                </span>
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
