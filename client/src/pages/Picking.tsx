import { PageHeader } from "@/components/PageHeader";
import { Package } from "lucide-react";

export default function Picking() {
  return (
    <div className="min-h-screen">
      <PageHeader
        icon={<Package className="h-8 w-8" />}
        title="Separação"
        description="Picking e separação de pedidos"
      />
      <main className="container mx-auto px-6 py-8">
        <div className="text-center py-16 text-white/70">Módulo em desenvolvimento</div>
      </main>
    </div>
  );
}
