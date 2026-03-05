import { Link } from "wouter";
import { Users, Package, MapPin, UserCog, FolderOpen } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

export default function Cadastros() {
  const modules = [
    {
      id: "clientes",
      title: "Clientes",
      description: "Gestão de clientes e contratos",
      icon: Users,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      href: "/tenants",
      features: [
        "Cadastrar clientes",
        "Gerenciar contratos",
        "Visualizar informações",
      ],
    },
    {
      id: "produtos",
      title: "Produtos",
      description: "Catálogo de produtos e medicamentos",
      icon: Package,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
      href: "/products",
      features: [
        "Cadastrar produtos",
        "Controlar SKUs",
        "Gerenciar estoque mínimo",
      ],
    },
    {
      id: "enderecos",
      title: "Endereços",
      description: "Estrutura de armazenagem do depósito",
      icon: MapPin,
      color: "text-green-600",
      bgColor: "bg-green-50",
      href: "/locations",
      features: [
        "Cadastrar endereços",
        "Definir zonas",
        "Configurar regras",
      ],
    },
    {
      id: "usuarios",
      title: "Usuários",
      description: "Controle de acesso e permissões",
      icon: UserCog,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
      href: "/users",
      features: [
        "Gerenciar usuários",
        "Atribuir perfis",
        "Controlar permissões",
      ],
    },
  ];

  return (
    <>
      <PageHeader
        icon={<FolderOpen className="w-8 h-8" />}
        title="Cadastros"
        description="Gestão de dados mestre do sistema"
      />
      
      <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 max-w-5xl mx-auto">
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              <Link key={module.id} href={module.href}>
                <div className="block group bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 p-4 sm:p-6 border border-gray-200 hover:border-blue-300 h-full">
                  {/* Icon and Title */}
                  <div className="flex items-start gap-3 sm:gap-4 mb-3 sm:mb-4">
                    <div
                      className={`${module.bgColor} ${module.color} p-2 sm:p-3 rounded-lg group-hover:scale-110 transition-transform duration-300 flex-shrink-0`}
                    >
                      <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg sm:text-xl font-semibold text-gray-800 mb-1 group-hover:text-blue-600 transition-colors">
                        {module.title}
                      </h3>
                      <p className="text-xs sm:text-sm text-gray-600">
                        {module.description}
                      </p>
                    </div>
                  </div>

                  {/* Features List */}
                  <ul className="space-y-1.5 sm:space-y-2 mb-3 sm:mb-4">
                    {module.features.map((feature, idx) => (
                      <li
                        key={idx}
                        className="text-xs sm:text-sm text-gray-600 flex items-center gap-2"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0"></span>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {/* Action Button */}
                  <div className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium py-2.5 sm:py-3 px-4 rounded-lg transition-all duration-300 shadow-md hover:shadow-lg text-center text-sm sm:text-base min-h-[44px] flex items-center justify-center">
                    Acessar Módulo
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
