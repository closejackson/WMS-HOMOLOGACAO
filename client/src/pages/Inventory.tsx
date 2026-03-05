import { PageHeader } from "@/components/PageHeader";
import { Warehouse } from "lucide-react";

export default function Inventory() {
  return (
    <div className="min-h-screen">
      <PageHeader
        icon={<Warehouse className="h-8 w-8" />}
        title="Estoque"
        description="Controle e rastreabilidade de inventário"
      />
      <main className="container mx-auto px-6 py-8">
        <div className="text-center py-16 text-white/70">Módulo em desenvolvimento</div>
      </main>
    </div>
  );
}
