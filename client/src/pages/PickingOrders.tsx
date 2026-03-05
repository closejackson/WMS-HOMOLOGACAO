import { useState, useEffect } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Package, Clock, CheckCircle2, AlertCircle, Truck, Trash2, X, Waves, Edit, Printer } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImportOrdersDialog } from "@/components/ImportOrdersDialog";
import { useBusinessError } from "@/hooks/useBusinessError";
import { useAuth } from "@/_core/hooks/useAuth";
import { ProductCombobox } from "@/components/ProductCombobox";

interface ProductItem {
  productId: number;
  productName: string;
  sku?: string;
  quantity: number;
  unit: "box" | "unit";
}

export default function PickingOrders() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"orders" | "waves">("orders");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [isCreateWaveDialogOpen, setIsCreateWaveDialogOpen] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [customerOrderNumber, setCustomerOrderNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "urgent" | "emergency">("normal");
  const [selectedProducts, setSelectedProducts] = useState<ProductItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [unit, setUnit] = useState<"box" | "unit">("box");
  
  // Estados para edição de pedido
  const [editTenantId, setEditTenantId] = useState<string>("");
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editPriority, setEditPriority] = useState<"low" | "normal" | "urgent" | "emergency">("normal");
  const [editProducts, setEditProducts] = useState<ProductItem[]>([]);
  const [editSelectedProductId, setEditSelectedProductId] = useState<string>("");
  const [editQuantity, setEditQuantity] = useState<number>(1);
  const [editUnit, setEditUnit] = useState<"box" | "unit">("box");
  
  // Hook de erros de negócio
  const businessError = useBusinessError();
  
  // Utils para chamadas imperativas
  const utils = trpc.useUtils();

  // Estados para edição de onda
  const [isEditWaveDialogOpen, setIsEditWaveDialogOpen] = useState(false);
  const [editingWave, setEditingWave] = useState<any>(null);
  const [editWaveItems, setEditWaveItems] = useState<Array<{ waveItemId: number; productSku: string; productName: string; totalQuantity: number; pickedQuantity: number }>>([]);

  // Estados para reimpressão de etiquetas
  const [isReprintDialogOpen, setIsReprintDialogOpen] = useState(false);
  const [reprintOrder, setReprintOrder] = useState<any>(null);
  const [reprintVolumeQuantity, setReprintVolumeQuantity] = useState("");

  const { data: orders, isLoading, refetch } = trpc.picking.list.useQuery({ limit: 100 });
  const { data: waves, isLoading: wavesLoading, refetch: refetchWaves } = trpc.wave.list.useQuery({ limit: 100 });
  // Usa o tenantId do cliente selecionado ou, se não houver seleção, o tenant do usuário logado
  const effectiveProductTenantId = selectedTenantId ? parseInt(selectedTenantId) : (user?.tenantId ?? null);
  const { data: products } = trpc.products.list.useQuery(
    effectiveProductTenantId ? { tenantId: effectiveProductTenantId } : undefined,
    { enabled: !!effectiveProductTenantId }
  );
  const { data: editProducts_available } = trpc.products.list.useQuery(
    editTenantId ? { tenantId: parseInt(editTenantId) } : undefined,
    { enabled: !!editTenantId } // Só buscar quando tenant estiver selecionado na edição
  );
  const { data: inventory } = trpc.stock.getPositions.useQuery({});
  const { data: tenants } = trpc.tenants.list.useQuery(); // Buscar lista de clientes
  const { data: editOrderDetails } = trpc.picking.getById.useQuery(
    { id: editingOrder?.id || 0 },
    { enabled: !!editingOrder }
  );

  const { data: editWaveDetails } = trpc.wave.getById.useQuery(
    { id: editingWave?.id || 0 },
    { enabled: !!editingWave }
  );

  // Carregar itens do pedido ao editar
  useEffect(() => {
    if (editOrderDetails?.items && isEditDialogOpen) {
      setEditProducts(
        editOrderDetails.items.map((item: any) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.requestedQuantity,
          unit: item.requestedUM,
        }))
      );
    }
  }, [editOrderDetails, isEditDialogOpen]);

  // Carregar itens da onda ao editar
  useEffect(() => {
    if (editWaveDetails?.items && isEditWaveDialogOpen) {
      setEditWaveItems(
        editWaveDetails.items.map((item: any) => ({
          waveItemId: item.id,
          productSku: item.productSku,
          productName: item.productName,
          totalQuantity: item.totalQuantity,
          pickedQuantity: item.pickedQuantity,
        }))
      );
    }
  }, [editWaveDetails, isEditWaveDialogOpen]);

  const createWaveMutation = trpc.wave.create.useMutation({
    onSuccess: () => {
      refetchWaves();
      setIsCreateWaveDialogOpen(false);
      setSelectedOrderIds([]);
      alert("Onda criada com sucesso!");
    },
    onError: (error) => {
      alert(`Erro ao criar onda: ${error.message}`);
    },
  });

  const deleteWaveMutation = trpc.wave.delete.useMutation({
    onSuccess: () => {
      refetchWaves();
      alert("Onda excluída com sucesso!");
    },
    onError: (error) => {
      alert(`Erro ao excluir onda: ${error.message}`);
    },
  });

  const deleteCompletedWaveMutation = trpc.wave.deleteCompleted.useMutation({
    onSuccess: (result) => {
      refetchWaves();
      refetch(); // Atualizar lista de pedidos também
      alert(result.message);
    },
    onError: (error) => {
      alert(`Erro ao excluir onda: ${error.message}`);
    },
  });

  const editCompletedWaveMutation = trpc.wave.editCompleted.useMutation({
    onSuccess: (result) => {
      refetchWaves();
      setIsEditWaveDialogOpen(false);
      setEditingWave(null);
      alert(result.message);
    },
    onError: (error) => {
      alert(`Erro ao editar onda: ${error.message}`);
    },
  });

  const generateLabelsMutation = trpc.stage.generateVolumeLabels.useMutation();

  const handleReprintLabels = async () => {
    const qty = parseInt(reprintVolumeQuantity);
    if (isNaN(qty) || qty < 1) {
      alert("Informe uma quantidade válida de volumes");
      return;
    }

    try {
      // Buscar dados completos do pedido se customerName ou clientName estiverem faltando
      let customerName = reprintOrder.customerName;
      let tenantName = reprintOrder.clientName;

      // Se customerName ou tenantName estiverem faltando, usar valores padrão informativos
      if (!customerName) {
        customerName = "Destinatário não informado";
      }
      if (!tenantName) {
        tenantName = "Cliente não identificado";
      }

      const result = await generateLabelsMutation.mutateAsync({
        customerOrderNumber: reprintOrder.customerOrderNumber,
        customerName: customerName || "N/A",
        tenantName: tenantName || "N/A",
        totalVolumes: qty,
      });

      // Converter base64 para blob e baixar
      const byteCharacters = atob(result.pdfBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      
      // Criar link de download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      alert(`Etiquetas geradas com sucesso! (${qty} volumes)`);

      // Resetar estado
      setIsReprintDialogOpen(false);
      setReprintOrder(null);
      setReprintVolumeQuantity("");
    } catch (error: any) {
      alert(`Erro ao gerar etiquetas: ${error.message}`);
    }
  };

  // Função para ajustar quantidades com base no estoque disponível
  const adjustQuantities = (insufficientItems: Array<{
    productSku: string;
    availableBoxes?: number;
    availableQuantity: number;
    unitsPerBox?: number;
  }>) => {
    const allProducts = products || [];
    
    setSelectedProducts(prev => {
      return prev.map(product => {
        // Buscar produto completo pelo productId
        const fullProduct = allProducts.find((p: any) => p.id === product.productId);
        if (!fullProduct) return product;
        
        // Buscar se este produto tem erro de estoque
        const errorItem = insufficientItems.find(item => item.productSku === fullProduct.sku);
        
        if (!errorItem) {
          // Produto não tem erro, manter como está
          return product;
        }
        
        // Lógica inteligente de conversão:
        // Se disponível < 1 caixa OU não é caixa fechada (ex: 3.5 caixas) → usar unidades
        // Caso contrário → usar caixas
        const availableBoxes = errorItem.availableBoxes || 0;
        const availableUnits = errorItem.availableQuantity || 0;
        
        // Verificar se é caixa fechada (número inteiro >= 1)
        const isFullBox = availableBoxes >= 1 && Number.isInteger(availableBoxes);
        
        if (isFullBox) {
          // Usar caixas
          return {
            ...product,
            quantity: availableBoxes,
            unit: 'box' as const,
          };
        } else {
          // Usar unidades (quando < 1 caixa ou caixa fracionada)
          return {
            ...product,
            quantity: availableUnits,
            unit: 'unit' as const,
          };
        }
      });
    });
  };

  const createMutation = trpc.picking.create.useMutation({
    onSuccess: () => {
      refetch();
      setIsCreateDialogOpen(false);
      setSelectedTenantId("");
      setCustomerOrderNumber("");
      setCustomerName("");
      setPriority("normal");
      setSelectedProducts([]);
      alert("Pedido criado com sucesso!");
    },
    onError: (error) => {
      const message = error.message;
      
      // Tentar parsear como JSON estruturado (múltiplos produtos)
      try {
        const parsed = JSON.parse(message);
        if (parsed.type === 'INSUFFICIENT_STOCK_MULTIPLE' && Array.isArray(parsed.items)) {
          const items = parsed.items.map((item: any) => ({
            productSku: item.sku,
            productName: item.name,
            requestedQuantity: item.requestedQuantity,
            requestedUnit: item.requestedUnit,
            requestedUnits: item.requestedUnits,
            availableQuantity: item.availableUnits,
            availableBoxes: item.availableBoxes,
            unitsPerBox: item.unitsPerBox,
          }));
          businessError.showInsufficientStock(items, () => adjustQuantities(items));
          return;
        }
      } catch (e) {
        // Não é JSON, continuar com regex
      }
      
      // Fallback: Estoque insuficiente - formato legado (produto único)
      const stockMatch = message.match(
        /Estoque insuficiente para produto ([\w-]+) \((.+?)\)\. Disponível: ([\d.]+) caixa\(s\) \/ ([\d.]+) unidades\. Solicitado: ([\d.]+) (caixa\(s\)|unidade\(s\)) \(([\d.]+) unidades\)\. UnitsPerBox: ([\d.]+)/
      );
      
      if (stockMatch) {
        const [, sku, name, availableBoxes, availableUnits, requested, unit, requestedUnits, unitsPerBox] = stockMatch;
        const item = {
          productSku: sku,
          productName: name,
          requestedQuantity: parseFloat(requested),
          requestedUnit: unit.replace('(s)', 's'),
          requestedUnits: parseFloat(requestedUnits),
          availableQuantity: parseFloat(availableUnits),
          availableBoxes: parseFloat(availableBoxes),
          unitsPerBox: parseFloat(unitsPerBox),
        };
        businessError.showInsufficientStock(item, () => adjustQuantities([item]));
        return;
      }
      
      // Produto não encontrado
      const notFoundMatch = message.match(/Produto ID (\d+) não encontrado/);
      if (notFoundMatch) {
        businessError.showProductNotFound(notFoundMatch[1]);
        return;
      }
      
      // Permissão negada
      if (message.includes("não tem permissão") || message.includes("FORBIDDEN")) {
        businessError.showPermissionDenied("criar pedidos para este cliente");
        return;
      }
      
      // Erro genérico
      businessError.showGenericError(message);
    },
  });

  const deleteManyMutation = trpc.picking.deleteBatch.useMutation({
    onSuccess: (result) => {
      refetch();
      setSelectedOrderIds([]);
      alert(`${result.deleted} pedido(s) excluído(s) com sucesso!`);
    },
    onError: (error) => {
      const message = error.message;
      
      if (message.includes("não tem permissão") || message.includes("FORBIDDEN")) {
        businessError.showPermissionDenied("excluir pedidos");
      } else {
        businessError.showGenericError(message);
      }
    },
  });

  const updateMutation = trpc.picking.update.useMutation({
    onSuccess: () => {
      refetch();
      setIsEditDialogOpen(false);
      setEditingOrder(null);
      alert("Pedido atualizado com sucesso!");
    },
    onError: (error) => {
      const message = error.message;
      
      // Tentar parsear como JSON estruturado (múltiplos produtos)
      try {
        const parsed = JSON.parse(message);
        if (parsed.type === 'INSUFFICIENT_STOCK_MULTIPLE' && Array.isArray(parsed.items)) {
          const items = parsed.items.map((item: any) => ({
            productSku: item.sku,
            productName: item.name,
            requestedQuantity: item.requestedQuantity,
            requestedUnit: item.requestedUnit,
            requestedUnits: item.requestedUnits,
            availableQuantity: item.availableUnits,
            availableBoxes: item.availableBoxes,
            unitsPerBox: item.unitsPerBox,
          }));
          businessError.showInsufficientStock(items, () => adjustQuantities(items));
          return;
        }
      } catch (e) {
        // Não é JSON, continuar com regex
      }
      
      // Fallback: Estoque insuficiente - formato legado (produto único)
      const stockMatch = message.match(
        /Estoque insuficiente para produto ([\w-]+) \((.+?)\)\. Disponível: ([\d.]+) caixa\(s\) \/ ([\d.]+) unidades\. Solicitado: ([\d.]+) (caixa\(s\)|unidade\(s\)) \(([\d.]+) unidades\)\. UnitsPerBox: ([\d.]+)/
      );
      
      if (stockMatch) {
        const [, sku, name, availableBoxes, availableUnits, requested, unit, requestedUnits, unitsPerBox] = stockMatch;
        const item = {
          productSku: sku,
          productName: name,
          requestedQuantity: parseFloat(requested),
          requestedUnit: unit.replace('(s)', 's'),
          requestedUnits: parseFloat(requestedUnits),
          availableQuantity: parseFloat(availableUnits),
          availableBoxes: parseFloat(availableBoxes),
          unitsPerBox: parseFloat(unitsPerBox),
        };
        businessError.showInsufficientStock(item, () => adjustQuantities([item]));
        return;
      }
      
      // Produto não encontrado
      const notFoundMatch = message.match(/Produto ID (\d+) não encontrado/);
      if (notFoundMatch) {
        businessError.showProductNotFound(notFoundMatch[1]);
        return;
      }
      
      // Permissão negada
      if (message.includes("não tem permissão") || message.includes("FORBIDDEN")) {
        businessError.showPermissionDenied("atualizar este pedido");
        return;
      }
      
      businessError.showGenericError(message);
    },
  });

  const handleAddProduct = async () => {
    if (!selectedProductId || quantity <= 0) {
      alert("Selecione um produto e informe a quantidade.");
      return;
    }

    if (!selectedTenantId) {
      alert("Selecione o cliente primeiro.");
      return;
    }

    const product = products?.find((p: any) => p.id === parseInt(selectedProductId));
    if (!product) {
      alert("Produto não encontrado.");
      return;
    }

    // Verificar se produto já foi adicionado
    if (selectedProducts.some((p) => p.productId === product.id)) {
      alert("Produto já adicionado. Remova-o para adicionar novamente.");
      return;
    }

    try {
      // Verificar disponibilidade de estoque via tRPC
      const availability = await utils.products.checkAvailability.fetch({
        productId: product.id,
        tenantId: parseInt(selectedTenantId),
        requestedQuantity: quantity,
        unit: unit,
      });

      if (!availability.available) {
        if (availability.hasStockInSpecialZonesOnly) {
          alert(
            `Produto disponível apenas em zonas especiais (expedição, recebimento, avaria ou devolução).\n\n` +
            `Não é possível reservar estoque dessas zonas para novos pedidos.`
          );
        } else if (availability.totalAvailable === 0) {
          alert(`Produto sem estoque disponível para este cliente.`);
        } else {
          const unitLabel = unit === "box" ? "caixas" : "unidades";
          const availableInUnit = unit === "box" && product.unitsPerBox
            ? Math.floor(availability.totalAvailable / product.unitsPerBox)
            : availability.totalAvailable;
          
          alert(
            `Quantidade insuficiente.\n\n` +
            `Disponível: ${availableInUnit} ${unitLabel}\n` +
            `Solicitado: ${quantity} ${unitLabel}`
          );
        }
        return;
      }

      // Estoque suficiente - adicionar produto
      setSelectedProducts([
        ...selectedProducts,
        {
          productId: product.id,
          productName: product.description,
          quantity,
          unit,
        },
      ]);

      // Limpar campos
      setSelectedProductId("");
      setQuantity(1);
      setUnit("box");
    } catch (error: any) {
      if (error.message?.includes("Produto não cadastrado")) {
        alert("Produto não cadastrado no sistema.");
      } else {
        alert(`Erro ao verificar disponibilidade: ${error.message || "Erro desconhecido"}`);
      }
    }
  };

  const handleRemoveProduct = (productId: number) => {
    setSelectedProducts(selectedProducts.filter((p) => p.productId !== productId));
  };

  const handleCreate = () => {
    if (!selectedTenantId) {
      alert("Selecione o cliente para quem o pedido será criado.");
      return;
    }

    if (!customerName) {
      alert("Informe o nome do cliente.");
      return;
    }

    if (selectedProducts.length === 0) {
      alert("Adicione pelo menos um produto ao pedido.");
      return;
    }

    createMutation.mutate({
      tenantId: parseInt(selectedTenantId),
      customerOrderNumber: customerOrderNumber || undefined,
      customerName,
      priority,
      items: selectedProducts.map((p) => ({
        productId: p.productId,
        requestedQuantity: p.quantity,
        requestedUnit: p.unit,
      })),
    });
  };

  const handleEdit = async (order: any) => {
    setEditingOrder(order);
    setEditTenantId(order.tenantId.toString());
    setEditCustomerName(order.customerName);
    setEditPriority(order.priority);
    setEditProducts([]); // Limpar produtos antes de carregar
    setIsEditDialogOpen(true);
  };

  const handleAddEditProduct = async () => {
    if (!editSelectedProductId || editQuantity <= 0) {
      alert("Selecione um produto e informe a quantidade.");
      return;
    }

    if (!editTenantId) {
      alert("Selecione o cliente primeiro.");
      return;
    }

    const product = editProducts_available?.find((p: any) => p.id === parseInt(editSelectedProductId));
    if (!product) {
      alert("Produto não encontrado.");
      return;
    }

    if (editProducts.some((p) => p.productId === product.id)) {
      alert("Produto já adicionado. Remova-o para adicionar novamente.");
      return;
    }

    try {
      // Verificar disponibilidade de estoque via tRPC
      const availability = await utils.products.checkAvailability.fetch({
        productId: product.id,
        tenantId: parseInt(editTenantId),
        requestedQuantity: editQuantity,
        unit: editUnit,
      });

      if (!availability.available) {
        if (availability.hasStockInSpecialZonesOnly) {
          alert(
            `Produto disponível apenas em zonas especiais (expedição, recebimento, avaria ou devolução).\n\n` +
            `Não é possível reservar estoque dessas zonas para novos pedidos.`
          );
        } else if (availability.totalAvailable === 0) {
          alert(`Produto sem estoque disponível para este cliente.`);
        } else {
          const unitLabel = editUnit === "box" ? "caixas" : "unidades";
          const availableInUnit = editUnit === "box" && product.unitsPerBox
            ? Math.floor(availability.totalAvailable / product.unitsPerBox)
            : availability.totalAvailable;
          
          alert(
            `Quantidade insuficiente.\n\n` +
            `Disponível: ${availableInUnit} ${unitLabel}\n` +
            `Solicitado: ${editQuantity} ${unitLabel}`
          );
        }
        return;
      }

      // Estoque suficiente - adicionar produto
      setEditProducts([
        ...editProducts,
        {
          productId: product.id,
          productName: product.description,
          quantity: editQuantity,
          unit: editUnit,
        },
      ]);

      setEditSelectedProductId("");
      setEditQuantity(1);
      setEditUnit("box");
    } catch (error: any) {
      if (error.message?.includes("Produto não cadastrado")) {
        alert("Produto não cadastrado no sistema.");
      } else {
        alert(`Erro ao verificar disponibilidade: ${error.message || "Erro desconhecido"}`);
      }
    }
  };

  const handleRemoveEditProduct = (productId: number) => {
    setEditProducts(editProducts.filter((p) => p.productId !== productId));
  };

  const handleUpdate = () => {
    if (!editTenantId) {
      alert("Selecione o cliente.");
      return;
    }

    if (!editCustomerName) {
      alert("Informe o nome do cliente.");
      return;
    }

    if (editProducts.length === 0) {
      alert("Adicione pelo menos um produto ao pedido.");
      return;
    }

    updateMutation.mutate({
      id: editingOrder.id,
      tenantId: parseInt(editTenantId),
      customerName: editCustomerName,
      priority: editPriority,
      items: editProducts.map((p) => ({
        productId: p.productId,
        requestedQuantity: p.quantity,
        requestedUnit: p.unit,
      })),
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; className: string; icon: any }> = {
      pending:    { label: "Pendente",   className: "bg-gray-500 text-white",         icon: Clock },
      picking:    { label: "Separando",  className: "bg-blue-600 text-white",         icon: Package },
      picked:     { label: "Separado",   className: "bg-teal-600 text-white",         icon: CheckCircle2 },
      staged:     { label: "Conferido",  className: "bg-indigo-600 text-white",       icon: CheckCircle2 },
      invoiced:   { label: "NF Vinculada", className: "bg-emerald-600 text-white",    icon: CheckCircle2 },
      completed:  { label: "Completo",   className: "bg-green-600 text-white",        icon: CheckCircle2 },
      checking:   { label: "Conferindo", className: "bg-amber-500 text-white",        icon: AlertCircle },
      packed:     { label: "Embalado",   className: "bg-purple-600 text-white",       icon: Package },
      shipped:    { label: "Expedido",   className: "bg-sky-600 text-white",          icon: Truck },
      cancelled:  { label: "Cancelado",  className: "bg-red-600 text-white",          icon: AlertCircle },
    };

    const config = variants[status] || variants.pending;
    const Icon = config.icon;

    return (
      <Badge className={`gap-1 ${config.className}`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      emergency: { label: "Emergência", className: "bg-red-500 text-white" },
      urgent: { label: "Urgente", className: "bg-orange-500 text-white" },
      normal: { label: "Normal", className: "bg-blue-500 text-white" },
      low: { label: "Baixa", className: "bg-gray-500 text-white" },
    };

    const config = variants[priority] || variants.normal;

    return <Badge className={config.className}>{config.label}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <p className="text-white/70">Carregando pedidos...</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Pedidos de Separação"
        description="Gerencie e acompanhe pedidos de picking"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" className="bg-white text-gray-700 hover:bg-gray-50" onClick={() => setIsImportDialogOpen(true)}>
              <Package className="h-4 w-4 mr-2" />
              Importar Excel
            </Button>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Pedido
                </Button>
              </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Pedido de Separação</DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              {/* Dados do Pedido */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Dados do Pedido</h3>
                
                <div>
                  <Label>Nº do Pedido (Cliente)</Label>
                  <Input
                    value={customerOrderNumber}
                    onChange={(e) => setCustomerOrderNumber(e.target.value)}
                    placeholder="Número do pedido do cliente (opcional)"
                  />
                </div>

                <div>
                  <Label>Cliente (Tenant) *</Label>
                  <Select value={selectedTenantId} onValueChange={(value) => {
                    setSelectedTenantId(value);
                    setSelectedProducts([]); // Limpar produtos ao trocar cliente
                    setSelectedProductId("");
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {tenants?.map((tenant) => (
                        <SelectItem key={tenant.id} value={String(tenant.id)}>
                          {tenant.name} - {tenant.cnpj}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Nome do Destinatário *</Label>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Nome do destinatário (farmácia, hospital, etc.)"
                  />
                </div>

                <div>
                  <Label>Prioridade</Label>
                  <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Baixa</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="urgent">Urgente</SelectItem>
                      <SelectItem value="emergency">Emergência</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Adicionar Produtos */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Produtos</h3>
                
                <div className="space-y-3">
                  <div>
                    <Label>Produto</Label>
                    <ProductCombobox
                      products={products}
                      value={selectedProductId}
                      onValueChange={setSelectedProductId}
                      placeholder={products?.length === 0 ? "Nenhum produto cadastrado" : "Selecione o produto"}
                      disabled={false}
                    />
                  </div>

                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-5">
                      <Label>Quantidade</Label>
                      <Input
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                      />
                    </div>

                    <div className="col-span-4">
                      <Label>Unidade</Label>
                      <Select value={unit} onValueChange={(v: any) => setUnit(v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="box">Caixa</SelectItem>
                          <SelectItem value="unit">Unidade</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="col-span-3 flex items-end">
                      <Button type="button" onClick={handleAddProduct} className="w-full">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Lista de Produtos Adicionados */}
                {selectedProducts.length > 0 && (
                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produto</TableHead>
                          <TableHead>Quantidade</TableHead>
                          <TableHead>Unidade</TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedProducts.map((product) => (
                          <TableRow key={product.productId}>
                            <TableCell className="font-medium">{product.productName}</TableCell>
                            <TableCell>{product.quantity}</TableCell>
                            <TableCell>{product.unit === "box" ? "Caixa" : "Unidade"}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveProduct(product.productId)}
                              >
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {selectedProducts.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
                    <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Nenhum produto adicionado</p>
                  </div>
                )}
              </div>

              {/* Botões de Ação */}
              <div className="flex gap-2 justify-end pt-4 border-t">
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleCreate} 
                  disabled={!customerName || selectedProducts.length === 0 || createMutation.isPending}
                >
                  {createMutation.isPending ? "Criando..." : "Criar Pedido"}
                </Button>
              </div>
            </div>
        </DialogContent>
      </Dialog>
          </div>
        }
      />

      {/* Dialog de Edição */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Pedido de Separação</DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              {/* Dados do Pedido */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Dados do Pedido</h3>
                
                <div>
                  <Label>Cliente (Tenant) *</Label>
                  <Select value={editTenantId} onValueChange={setEditTenantId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {tenants?.map((tenant) => (
                        <SelectItem key={tenant.id} value={String(tenant.id)}>
                          {tenant.name} - {tenant.cnpj}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Nome do Destinatário *</Label>
                  <Input
                    value={editCustomerName}
                    onChange={(e) => setEditCustomerName(e.target.value)}
                    placeholder="Nome do destinatário (farmácia, hospital, etc.)"
                  />
                </div>

                <div>
                  <Label>Prioridade</Label>
                  <Select value={editPriority} onValueChange={(v: any) => setEditPriority(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Baixa</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="urgent">Urgente</SelectItem>
                      <SelectItem value="emergency">Emergência</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Adicionar Produtos */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Produtos</h3>
                
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-5">
                    <Label>Produto</Label>
                    <ProductCombobox
                      products={editProducts_available}
                      value={editSelectedProductId}
                      onValueChange={setEditSelectedProductId}
                      placeholder={!editTenantId ? "Cliente não definido" : editProducts_available?.length === 0 ? "Nenhum produto cadastrado para este cliente" : "Selecione o produto"}
                      disabled={!editTenantId}
                    />
                  </div>

                  <div className="col-span-3">
                    <Label>Quantidade</Label>
                    <Input
                      type="number"
                      min="1"
                      value={editQuantity}
                      onChange={(e) => setEditQuantity(parseInt(e.target.value) || 1)}
                    />
                  </div>

                  <div className="col-span-2">
                    <Label>Unidade</Label>
                    <Select value={editUnit} onValueChange={(v: any) => setEditUnit(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="box">Caixa</SelectItem>
                        <SelectItem value="unit">Unidade</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-2 flex items-end">
                    <Button type="button" onClick={handleAddEditProduct} className="w-full">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Lista de Produtos Adicionados */}
                {editProducts.length > 0 && (
                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produto</TableHead>
                          <TableHead>Quantidade</TableHead>
                          <TableHead>Unidade</TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {editProducts.map((product) => (
                          <TableRow key={product.productId}>
                            <TableCell className="font-medium">{product.productName}</TableCell>
                            <TableCell>{product.quantity}</TableCell>
                            <TableCell>{product.unit === "box" ? "Caixa" : "Unidade"}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveEditProduct(product.productId)}
                              >
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {editProducts.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
                    <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Nenhum produto adicionado</p>
                  </div>
                )}
              </div>

              {/* Botões de Ação */}
              <div className="flex gap-2 justify-end pt-4 border-t">
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleUpdate} 
                  disabled={!editCustomerName || editProducts.length === 0 || updateMutation.isPending}
                >
                  {updateMutation.isPending ? "Atualizando..." : "Atualizar Pedido"}
                </Button>
              </div>
            </div>
        </DialogContent>
      </Dialog>

      <div className="container mx-auto py-8">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "orders" | "waves")}>
          <TabsList className="mb-6 bg-white/90 border border-gray-200 shadow-sm">
            <TabsTrigger value="orders" className="gap-2">
              <Package className="h-4 w-4" />
              Pedidos
            </TabsTrigger>
            <TabsTrigger value="waves" className="gap-2">
              <Waves className="h-4 w-4" />
              Ondas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="orders">
            {/* Botão Gerar Onda (aparece quando há pedidos selecionados) */}
            {selectedOrderIds.length > 0 && (
              <div className="mb-4 flex items-center justify-between bg-primary/10 p-4 rounded-lg border border-primary/20">
                <p className="font-semibold">
                  {selectedOrderIds.length} pedido(s) selecionado(s)
                </p>
                <div className="flex gap-2">
                  <Button 
                    variant="destructive"
                    onClick={() => {
                      if (confirm(`Tem certeza que deseja excluir ${selectedOrderIds.length} pedido(s)?`)) {
                        deleteManyMutation.mutate({ ids: selectedOrderIds });
                      }
                    }}
                    disabled={deleteManyMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {deleteManyMutation.isPending ? "Excluindo..." : "Excluir Selecionados"}
                  </Button>
                  <Button 
                    onClick={() => {
                      const selectedOrders = orders?.filter(o => selectedOrderIds.includes(o.id));
                      const uniqueTenants = new Set(selectedOrders?.map(o => o.tenantId).filter(Boolean));
                      
                      if (uniqueTenants.size > 1) {
                        alert("Todos os pedidos devem ser do mesmo cliente para gerar uma onda.");
                        return;
                      }
                      
                      createWaveMutation.mutate({ orderIds: selectedOrderIds });
                    }}
                    disabled={createWaveMutation.isPending}
                  >
                    <Waves className="h-4 w-4 mr-2" />
                    {createWaveMutation.isPending ? "Gerando..." : `Gerar Onda (${selectedOrderIds.length})`}
                  </Button>
                </div>
              </div>
            )}

            <div className="grid gap-4">
        {orders && orders.length === 0 && (
          <Card className="p-8 text-center">
            <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Nenhum pedido encontrado</h3>
            <p className="text-muted-foreground mb-4">Crie seu primeiro pedido de separação</p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Pedido
            </Button>
          </Card>
        )}

        {orders?.map((order) => {
          const isSelected = selectedOrderIds.includes(order.id);
          const isPending = order.status === "pending";
          const firstSelectedOrder = orders.find(o => selectedOrderIds.includes(o.id));
          const isDifferentTenant = firstSelectedOrder && firstSelectedOrder.tenantId !== order.tenantId;

          return (
            <Card 
              key={order.id} 
              className={`p-6 transition-shadow ${
                isSelected ? "border-primary bg-primary/5" : ""
              } ${
                isDifferentTenant && isPending ? "opacity-50" : ""
              }`}
            >
              <div className="flex items-center gap-4">
                {/* Checkbox para seleção (apenas pedidos pendentes) */}
                {isPending && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={isDifferentTenant}
                    onChange={(e) => {
                      e.stopPropagation();
                      if (isDifferentTenant) return;
                      
                      setSelectedOrderIds(prev => 
                        isSelected 
                          ? prev.filter(id => id !== order.id)
                          : [...prev, order.id]
                      );
                    }}
                    className="h-5 w-5 cursor-pointer"
                  />
                )}

                {/* Conteúdo do Card (clicável para ver detalhes) */}
                <Link href={`/picking/${order.id}`} className="flex-1">
                  <div className="hover:opacity-80 transition-opacity">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold">
                      {order.customerOrderNumber ? `Nº ${order.customerOrderNumber}` : order.orderNumber}
                    </h3>
                    {getStatusBadge(order.status)}
                    {getPriorityBadge(order.priority)}
                  </div>

                  <div className="text-sm text-muted-foreground space-y-1">
                    {order.customerOrderNumber && (
                      <p className="text-xs text-muted-foreground">Cód. interno: {order.orderNumber}</p>
                    )}
                    <p>Cliente: {order.clientName || "N/A"}</p>
                    <p>
                      Itens: {order.totalItems} | Quantidade Total: {order.totalQuantity}
                    </p>
                    <p>Criado em: {new Date(order.createdAt).toLocaleString("pt-BR")}</p>
                  </div>
                </div>

                      <div className="flex gap-2">
                        <Button size="sm">
                          Ver Detalhes
                        </Button>
                        {isPending && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleEdit(order);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {(order.status === "picked" || order.status === "staged") && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setReprintOrder(order);
                              setIsReprintDialogOpen(true);
                            }}
                          >
                            <Printer className="h-4 w-4 mr-1" />
                            Reimprimir Etiquetas
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>

                {isDifferentTenant && isPending && (
                  <p className="text-xs text-destructive mt-2">
                    ⚠️ Cliente diferente dos pedidos já selecionados
                  </p>
                )}
              </div>
            </Card>
          );
        })}
            </div>
          </TabsContent>

          <TabsContent value="waves">
            <div className="grid gap-4">
              {wavesLoading && (
                <p className="text-muted-foreground">Carregando ondas...</p>
              )}

              {waves && waves.length === 0 && (
                <Card className="p-8 text-center">
                  <Waves className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">Nenhuma onda encontrada</h3>
                  <p className="text-muted-foreground mb-4">Agrupe múltiplos pedidos do mesmo cliente em uma onda</p>
                  <Dialog open={isCreateWaveDialogOpen} onOpenChange={setIsCreateWaveDialogOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Gerar Onda
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Gerar Onda de Separação</DialogTitle>
                      </DialogHeader>

                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                          Selecione múltiplos pedidos do mesmo cliente para consolidar em uma onda.
                        </p>

                        {/* Filtrar apenas pedidos pendentes */}
                        {orders?.filter(o => o.status === "pending").length === 0 ? (
                          <p className="text-center py-8 text-muted-foreground">
                            Nenhum pedido pendente disponível para criar onda.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {orders?.filter(o => o.status === "pending").map((order) => {
                              const isSelected = selectedOrderIds.includes(order.id);
                              const firstSelectedOrder = orders.find(o => selectedOrderIds.includes(o.id));
                              const isDifferentTenant = firstSelectedOrder && firstSelectedOrder.tenantId !== order.tenantId;

                              return (
                                <Card 
                                  key={order.id} 
                                  className={`p-4 cursor-pointer transition-colors ${
                                    isSelected ? "border-primary bg-primary/5" : ""
                                  } ${isDifferentTenant ? "opacity-50" : ""}`}
                                  onClick={() => {
                                    if (isDifferentTenant) return;
                                    
                                    setSelectedOrderIds(prev => 
                                      isSelected 
                                        ? prev.filter(id => id !== order.id)
                                        : [...prev, order.id]
                                    );
                                  }}
                                >
                                  <div className="flex items-center gap-4">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      disabled={isDifferentTenant}
                                      onChange={() => {}} // Controlled by card click
                                      className="h-4 w-4"
                                    />
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="font-semibold">{order.orderNumber}</span>
                                        {getPriorityBadge(order.priority)}
                                      </div>
                                      <div className="text-sm text-muted-foreground">
                                        <p>Cliente: {order.clientName || "N/A"}</p>
                                        <p>Itens: {order.totalItems} | Quantidade: {order.totalQuantity}</p>
                                      </div>
                                    </div>
                                  </div>
                                  {isDifferentTenant && (
                                    <p className="text-xs text-destructive mt-2">
                                      ⚠️ Cliente diferente dos pedidos já selecionados
                                    </p>
                                  )}
                                </Card>
                              );
                            })}
                          </div>
                        )}

                        {selectedOrderIds.length > 0 && (
                          <div className="bg-muted p-4 rounded-lg">
                            <p className="font-semibold mb-2">
                              {selectedOrderIds.length} pedido(s) selecionado(s)
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Os itens serão consolidados e os endereços alocados automaticamente.
                            </p>
                          </div>
                        )}

                        <div className="flex gap-2 justify-end pt-4 border-t">
                          <Button 
                            variant="outline" 
                            onClick={() => {
                              setIsCreateWaveDialogOpen(false);
                              setSelectedOrderIds([]);
                            }}
                          >
                            Cancelar
                          </Button>
                          <Button 
                            onClick={() => {
                              if (selectedOrderIds.length === 0) {
                                alert("Selecione pelo menos um pedido.");
                                return;
                              }
                              createWaveMutation.mutate({ orderIds: selectedOrderIds });
                            }}
                            disabled={selectedOrderIds.length === 0 || createWaveMutation.isPending}
                          >
                            {createWaveMutation.isPending ? "Gerando..." : "Gerar Onda"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </Card>
              )}

              {waves?.map((wave: any) => (
                <Card key={wave.id} className="p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <Link href={`/picking/execute/${wave.id}`} className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold">{wave.waveNumber}</h3>
                        {getStatusBadge(wave.status)}
                      </div>

                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>Pedidos: {wave.totalOrders} | Itens: {wave.totalItems}</p>
                        <p>Quantidade Total: {wave.totalQuantity}</p>
                        <p>Criado em: {new Date(wave.createdAt).toLocaleString("pt-BR")}</p>
                      </div>
                    </Link>

                    <div className="flex gap-2">
                      {wave.status !== "cancelled" && (
                        <Link href={`/picking/execute/${wave.id}`}>
                          <Button variant="outline" size="sm" className="bg-white text-gray-700 hover:bg-gray-50">
                            {wave.status === "completed" ? "Visualizar" : "Executar"}
                          </Button>
                        </Link>
                      )}
                      
                      {/* Botões para ondas completed */}
                      {wave.status === "completed" && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="bg-white text-gray-700 hover:bg-gray-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingWave(wave);
                              setIsEditWaveDialogOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Tem certeza que deseja excluir a onda ${wave.waveNumber}? A separação será revertida e os pedidos voltam para pending.`)) {
                                deleteCompletedWaveMutation.mutate({ id: wave.id });
                              }
                            }}
                            disabled={deleteCompletedWaveMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      
                      {/* Botão para ondas pending/cancelled */}
                      {(wave.status === "pending" || wave.status === "cancelled") && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Tem certeza que deseja excluir a onda ${wave.waveNumber}? Os pedidos serão liberados.`)) {
                              deleteWaveMutation.mutate({ id: wave.id });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Modal de Edição de Onda */}
      <Dialog open={isEditWaveDialogOpen} onOpenChange={setIsEditWaveDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Onda {editingWave?.waveNumber}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ajuste as quantidades separadas de cada item. Use isso para corrigir erros de separação.
            </p>

            {editWaveItems.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">Carregando itens...</p>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Solicitado</TableHead>
                      <TableHead>Separado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {editWaveItems.map((item, index) => (
                      <TableRow key={item.waveItemId}>
                        <TableCell className="font-medium">{item.productName}</TableCell>
                        <TableCell>{item.productSku}</TableCell>
                        <TableCell>{item.totalQuantity}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            max={item.totalQuantity}
                            value={item.pickedQuantity}
                            onChange={(e) => {
                              const newValue = parseInt(e.target.value) || 0;
                              setEditWaveItems(prev => 
                                prev.map((it, i) => 
                                  i === index ? { ...it, pickedQuantity: newValue } : it
                                )
                              );
                            }}
                            className="w-24"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={() => {
                  setIsEditWaveDialogOpen(false);
                  setEditingWave(null);
                }}
              >
                Cancelar
              </Button>
              <Button 
                onClick={() => {
                  editCompletedWaveMutation.mutate({
                    waveId: editingWave.id,
                    items: editWaveItems.map(item => ({
                      waveItemId: item.waveItemId,
                      newPickedQuantity: item.pickedQuantity,
                    })),
                  });
                }}
                disabled={editCompletedWaveMutation.isPending}
              >
                {editCompletedWaveMutation.isPending ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Importação */}
      <ImportOrdersDialog 
        open={isImportDialogOpen} 
        onOpenChange={(open) => {
          setIsImportDialogOpen(open);
          if (!open) {
            refetch(); // Recarregar lista após importação
          }
        }} 
      />

      {/* Modal de Erros de Negócio */}
      {businessError.ErrorModal}

      {/* Modal de Reimpressão de Etiquetas */}
      <Dialog open={isReprintDialogOpen} onOpenChange={setIsReprintDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reimprimir Etiquetas de Volumes</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                Pedido: <span className="font-semibold">{reprintOrder?.customerOrderNumber}</span>
              </p>
              <p className="text-sm text-muted-foreground mb-2">
                Destinatário: <span className="font-semibold">{reprintOrder?.customerName || "N/A"}</span>
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                Cliente: <span className="font-semibold">{reprintOrder?.clientName || "N/A"}</span>
              </p>
            </div>
            <div>
              <Label htmlFor="reprintVolumes">Quantidade de Volumes</Label>
              <Input
                id="reprintVolumes"
                type="number"
                min="1"
                value={reprintVolumeQuantity}
                onChange={(e) => setReprintVolumeQuantity(e.target.value)}
                placeholder="Ex: 2"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setIsReprintDialogOpen(false);
                  setReprintOrder(null);
                  setReprintVolumeQuantity("");
                }}
              >
                Cancelar
              </Button>
              <Button onClick={handleReprintLabels}>
                <Printer className="h-4 w-4 mr-2" />
                Gerar Etiquetas
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
