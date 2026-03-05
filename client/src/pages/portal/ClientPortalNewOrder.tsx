import React, { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { ClientPortalImportOrdersDialog } from "@/components/ClientPortalImportOrdersDialog";
import { useBusinessError } from "@/hooks/useBusinessError";
import { ClientPortalLayout } from "@/components/ClientPortalLayout";
import { ProductCombobox } from "@/components/ProductCombobox";

interface ProductItem {
  productId: number;
  productName: string;
  sku?: string;
  quantity: number;
  unit: "box" | "unit";
}

export default function ClientPortalNewOrder() {
  const [, setLocation] = useLocation();
  const navigate = (path: string) => setLocation(path);
  
  const [activeTab, setActiveTab] = useState("individual");
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  
  // Estados do formulário
  const [customerOrderNumber, setCustomerOrderNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "urgent" | "emergency">("normal");
  const [selectedProducts, setSelectedProducts] = useState<ProductItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [unit, setUnit] = useState<"box" | "unit">("box");
  
  // Hook de erros de negócio
  const businessError = useBusinessError();
  
  // Utils para chamadas imperativas
  const utils = trpc.useUtils();
  
  // Queries - busca produtos cadastrados para o cliente (mesma lógica de /picking)
  const { data: products } = trpc.clientPortal.products.useQuery();
  
  console.log('[ClientPortalNewOrder] Produtos carregados:', products?.length || 0);
  
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
  
  // Mutation de criação
  const createMutation = trpc.clientPortal.createPickingOrder.useMutation({
    onSuccess: () => {
      toast.success("Pedido criado com sucesso!");
      navigate("/portal/pedidos");
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
        // Não é JSON estruturado, continuar com parsing de string
      }
      
      // Estoque insuficiente (mensagem de texto única)
      const stockMatch = message.match(
        /Produto (\S+) \(([^)]+)\): Estoque insuficiente\. Disponível: ([\d.]+) caixas \(([\d.]+) unidades\)\. Solicitado: ([\d.]+) (\w+)\(s\) \(([\d.]+) unidades\)\. Unidades por caixa: ([\d.]+)/
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
        businessError.showPermissionDenied("criar pedido");
        return;
      }
      
      businessError.showGenericError(message);
    },
  });
  
  // Adicionar produto
  const handleAddProduct = async () => {
    if (!selectedProductId || quantity <= 0) {
      toast.error("Selecione um produto e informe a quantidade.");
      return;
    }
    
    const product = products?.find((p) => p.id === parseInt(selectedProductId));
    if (!product) {
      toast.error("Produto não encontrado.");
      return;
    }
    
    // Verificar se produto já foi adicionado
    if (selectedProducts.some((p) => p.productId === product.id)) {
      toast.error("Produto já adicionado. Remova-o para adicionar novamente.");
      return;
    }
    
    try {
      // Verificar disponibilidade de estoque via tRPC
      // Nota: checkAvailability requer tenantId no sistema interno,
      // mas no portal do cliente o tenant é inferido automaticamente
      // Então vamos apenas adicionar o produto sem validação prévia
      // A validação será feita no backend ao criar o pedido
      
      // Adicionar produto
      setSelectedProducts([
        ...selectedProducts,
        {
          productId: product.id,
          productName: product.description,
          sku: product.sku,
          quantity,
          unit,
        },
      ]);
      
      // Limpar campos
      setSelectedProductId("");
      setQuantity(1);
      setUnit("box");
      
      toast.success("Produto adicionado!");
    } catch (error: any) {
      toast.error(`Erro ao verificar estoque: ${error.message}`);
    }
  };
  
  // Remover produto
  const handleRemoveProduct = (productId: number) => {
    setSelectedProducts(selectedProducts.filter((p) => p.productId !== productId));
  };
  
  // Criar pedido
  const handleCreateOrder = () => {
    if (!customerOrderNumber.trim()) {
      toast.error("Informe o número do pedido");
      return;
    }
    
    if (selectedProducts.length === 0) {
      toast.error("Adicione pelo menos um produto ao pedido");
      return;
    }
    
    // Nota: sessionToken é enviado automaticamente via cookie client_portal_session
    // O backend extrai via getPortalSession(ctx.req)
    createMutation.mutate({
      customerOrderNumber,
      priority,
      items: selectedProducts.map((p) => ({
        productId: p.productId,
        requestedQuantity: p.quantity,
        requestedUM: p.unit,
      })),
    });
  };
  
  // Importação
  const handleImportSuccess = () => {
    setIsImportDialogOpen(false);
    toast.success("Pedidos importados com sucesso!");
    navigate("/portal/pedidos");
  };
  
  return (
    <ClientPortalLayout>
    <div className="min-h-screen py-8">
      <div className="container max-w-5xl">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate("/portal/pedidos")}
            className="mb-4 text-white hover:text-white hover:bg-white/20"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para Pedidos
          </Button>
          <h1 className="text-3xl font-bold text-white drop-shadow-lg">Novo Pedido</h1>
          <p className="text-white/70 mt-2">
            Crie um pedido individual ou importe múltiplos pedidos via Excel
          </p>
        </div>
        
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="individual">Individual</TabsTrigger>
            <TabsTrigger value="importacao">Importação</TabsTrigger>
          </TabsList>
          
          {/* Aba Individual */}
          <TabsContent value="individual">
            <Card className="p-6">
              <div className="space-y-6">
                {/* Informações do Pedido */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="orderNumber">Número do Pedido *</Label>
                    <Input
                      id="orderNumber"
                      value={customerOrderNumber}
                      onChange={(e) => setCustomerOrderNumber(e.target.value)}
                      placeholder="Ex: PED-2024-001"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="customerName">Nome do Destinatário</Label>
                    <Input
                      id="customerName"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Ex: João Silva"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="priority">Prioridade</Label>
                    <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
                      <SelectTrigger id="priority">
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
                <div className="border-t pt-6">
                  <h3 className="font-semibold mb-4">Produtos do Pedido</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                    <div className="md:col-span-2">
                      <Label htmlFor="product">Produto</Label>
                      <ProductCombobox
                        products={products}
                        value={selectedProductId}
                        onValueChange={setSelectedProductId}
                        placeholder="Selecione um produto"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="quantity">Quantidade</Label>
                      <Input
                        id="quantity"
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={(e) => setQuantity(parseFloat(e.target.value) || 1)}
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="unit">Unidade</Label>
                      <Select value={unit} onValueChange={(v: any) => setUnit(v)}>
                        <SelectTrigger id="unit">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="box">Caixas</SelectItem>
                          <SelectItem value="unit">Unidades</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <Button onClick={handleAddProduct} className="mb-4">
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Produto
                  </Button>
                  
                  {/* Lista de Produtos */}
                  {selectedProducts.length > 0 && (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>SKU</TableHead>
                            <TableHead>Produto</TableHead>
                            <TableHead className="text-right">Quantidade</TableHead>
                            <TableHead className="text-right">Unidade</TableHead>
                            <TableHead className="w-[100px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedProducts.map((item) => (
                            <TableRow key={item.productId}>
                              <TableCell className="font-mono">{item.sku}</TableCell>
                              <TableCell>{item.productName}</TableCell>
                              <TableCell className="text-right">{item.quantity}</TableCell>
                              <TableCell className="text-right">
                                {item.unit === "box" ? "Caixas" : "Unidades"}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveProduct(item.productId)}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
                
                {/* Botões de Ação */}
                <div className="flex justify-end gap-4 border-t pt-6">
                  <Button
                    variant="outline"
                    onClick={() => navigate("/portal/pedidos")}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleCreateOrder}
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending ? "Criando..." : "Criar Pedido"}
                  </Button>
                </div>
              </div>
            </Card>
          </TabsContent>
          
          {/* Aba Importação */}
          <TabsContent value="importacao">
            <Card className="p-6">
              <div className="text-center py-8">
                <p className="text-gray-600 mb-4">
                  Importação de pedidos via Excel
                </p>
                <Button onClick={() => setIsImportDialogOpen(true)}>
                  Importar Pedidos
                </Button>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
        
        {/* Dialog de Importação */}
        <ClientPortalImportOrdersDialog
          open={isImportDialogOpen}
          onOpenChange={setIsImportDialogOpen}
          onSuccess={handleImportSuccess}
        />
      </div>
    </div>
    </ClientPortalLayout>
  );
}
