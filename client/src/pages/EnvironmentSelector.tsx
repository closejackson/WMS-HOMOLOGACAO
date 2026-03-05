/**
 * EnvironmentSelector.tsx
 *
 * Página de seleção de ambiente - Raiz do sistema (/)
 * Permite escolher entre Med@x WMS (sistema interno) ou Portal do Cliente
 */

import { Link } from "wouter";
import { Package, Users, ArrowRight, Building2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function EnvironmentSelector() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-5xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-600 rounded-3xl shadow-xl mb-6">
            <Package className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white drop-shadow-lg mb-3">Med@x WMS</h1>
          <p className="text-lg text-slate-100 drop-shadow">
            Sistema de Gerenciamento de Armazém Farmacêutico
          </p>
        </div>

        {/* Environment Cards */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Med@x WMS Card */}
          <Card className="backdrop-blur-md bg-white/90 border-0 shadow-xl">
            <CardHeader className="space-y-2 pb-3">
              <div className="flex items-center justify-between">
                <Building2 className="h-6 w-6 text-blue-600" />
                <ArrowRight className="h-5 w-5 text-slate-400" />
              </div>
              <CardTitle className="text-xl text-slate-900">Med@x WMS</CardTitle>
              <CardDescription className="text-sm text-slate-600">
                Sistema interno de gerenciamento de armazém
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700">Funcionalidades:</p>
                <ul className="space-y-1.5 text-xs text-slate-600">
                  <li className="flex items-start">
                    <span className="inline-block w-1 h-1 bg-blue-600 rounded-full mt-1.5 mr-2 flex-shrink-0" />
                    <span>Recebimento e conferência de mercadorias</span>
                  </li>
                  <li className="flex items-start">
                    <span className="inline-block w-1 h-1 bg-blue-600 rounded-full mt-1.5 mr-2 flex-shrink-0" />
                    <span>Separação e expedição de pedidos</span>
                  </li>
                  <li className="flex items-start">
                    <span className="inline-block w-1 h-1 bg-blue-600 rounded-full mt-1.5 mr-2 flex-shrink-0" />
                    <span>Controle de estoque e rastreabilidade</span>
                  </li>
                  <li className="flex items-start">
                    <span className="inline-block w-1 h-1 bg-blue-600 rounded-full mt-1.5 mr-2 flex-shrink-0" />
                    <span>Gestão de cadastros e relatórios</span>
                  </li>
                </ul>
              </div>

              <Link href="/home">
                <Button 
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm shadow-md hover:shadow-lg transition-all"
                >
                  Acessar Sistema WMS
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>

              <p className="text-[10px] text-center text-slate-500">
                Para colaboradores e operadores do armazém
              </p>
            </CardContent>
          </Card>

          {/* Portal do Cliente Card */}
          <Card className="backdrop-blur-md bg-slate-900/80 border-0 shadow-xl">
            <CardHeader className="space-y-2 pb-3">
              <div className="flex items-center justify-between">
                <Users className="h-6 w-6 text-slate-300" />
                <ArrowRight className="h-5 w-5 text-slate-400" />
              </div>
              <CardTitle className="text-xl text-white">Portal do Cliente</CardTitle>
              <CardDescription className="text-sm text-slate-400">
                Acompanhamento de estoques e pedidos em tempo real
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-300">Funcionalidades:</p>
                <ul className="space-y-1.5 text-xs text-slate-400">
                  <li className="flex items-start">
                    <span className="inline-block w-1 h-1 bg-slate-500 rounded-full mt-1.5 mr-2 flex-shrink-0" />
                    <span>Visualização de posições de estoque</span>
                  </li>
                  <li className="flex items-start">
                    <span className="inline-block w-1 h-1 bg-slate-500 rounded-full mt-1.5 mr-2 flex-shrink-0" />
                    <span>Acompanhamento de pedidos e status</span>
                  </li>
                  <li className="flex items-start">
                    <span className="inline-block w-1 h-1 bg-slate-500 rounded-full mt-1.5 mr-2 flex-shrink-0" />
                    <span>Histórico de recebimentos</span>
                  </li>
                  <li className="flex items-start">
                    <span className="inline-block w-1 h-1 bg-slate-500 rounded-full mt-1.5 mr-2 flex-shrink-0" />
                    <span>Dashboard com KPIs em tempo real</span>
                  </li>
                </ul>
              </div>

              <Link href="/portal/login">
                <Button 
                  className="w-full h-11 bg-white hover:bg-slate-100 text-slate-900 font-medium text-sm shadow-md hover:shadow-lg transition-all"
                >
                  Acessar Portal do Cliente
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>

              <p className="text-[10px] text-center text-slate-400">
                Para clientes com acesso cadastrado
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="text-center mt-12">
          <p className="text-sm text-slate-100 drop-shadow">
            © {new Date().getFullYear()} Med@x — Sistema de Gerenciamento de Armazém Farmacêutico
          </p>
          <p className="text-xs text-slate-200 mt-2">
            Conformidade ANVISA RDC 430/2020 • Rastreabilidade Total
          </p>
        </div>
      </div>
    </div>
  );
}
