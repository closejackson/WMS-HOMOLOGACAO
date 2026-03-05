import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

import { Loader2, Package, FileText, Truck, ArrowLeft, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { ManifestPrint } from "@/components/ManifestPrint";

export default function Shipping() {
  const toast = ({ title, description, variant }: { title: string; description?: string; variant?: string }) => {
    alert(`${title}${description ? '\n' + description : ''}`);
  };
  const [selectedOrders, setSelectedOrders] = useState<number[]>([]);
  const [selectedManifests, setSelectedManifests] = useState<number[]>([]);
  const [printManifestId, setPrintManifestId] = useState<number | null>(null);
  const printRef = useRef<{ print: () => void }>(null);
  
  // Query para dados de impressão
  const { data: printData } = trpc.shipping.generateManifestPDF.useQuery(
    { manifestId: printManifestId! },
    { enabled: printManifestId !== null }
  );
  
  // Disparar impressão quando dados estiverem prontos
  useEffect(() => {
    if (printData && printRef.current) {
      printRef.current.print();
      setPrintManifestId(null); // Limpar após imprimir
    }
  }, [printData]);
  
  // Queries
  const { data: orders, refetch: refetchOrders, isLoading: loadingOrders } = trpc.shipping.listOrders.useQuery();
  const { data: invoices, refetch: refetchInvoices, isLoading: loadingInvoices } = trpc.shipping.listInvoices.useQuery();
  const { data: manifests, refetch: refetchManifests, isLoading: loadingManifests } = trpc.shipping.listManifests.useQuery();

  // Mutations
  const importInvoice = trpc.shipping.importInvoice.useMutation({
    onSuccess: (data) => {
      toast({ title: "Sucesso", description: data.message });
      refetchInvoices();
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const linkInvoice = trpc.shipping.linkInvoiceToOrder.useMutation({
    onSuccess: (data) => {
      toast({ title: "Sucesso", description: data.message });
      refetchInvoices();
      refetchOrders();
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const createManifest = trpc.shipping.createManifest.useMutation({
    onSuccess: (data) => {
      toast({ title: "Sucesso", description: data.message });
      refetchManifests();
      refetchOrders();
      refetchInvoices();
      setSelectedOrders([]);
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const finalizeManifest = trpc.shipping.finalizeManifest.useMutation({
    onSuccess: (data) => {
      toast({ title: "Sucesso", description: data.message });
      refetchManifests();
      refetchOrders();
      refetchInvoices();
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const unlinkInvoice = trpc.shipping.unlinkInvoice.useMutation({
    onSuccess: (data) => {
      toast({ title: "Sucesso", description: data.message });
      refetchInvoices();
      refetchOrders();
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const deleteInvoice = trpc.shipping.deleteInvoice.useMutation({
    onSuccess: (data) => {
      toast({ title: "Sucesso", description: data.message });
      refetchInvoices();
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const deleteManifests = trpc.shipping.deleteMany.useMutation({
    onSuccess: (data) => {
      toast({ 
        title: "Sucesso", 
        description: `${data.deletedCount} romaneio(s) excluído(s). ${data.releasedOrders} pedido(s) liberado(s).` 
      });
      refetchManifests();
      refetchOrders();
      setSelectedManifests([]);
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const cancelShipping = trpc.shipping.cancelShipping.useMutation({
    onSuccess: (data) => {
      toast({ title: "Sucesso", description: data.message });
      refetchOrders();
      refetchInvoices();
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  // Form states
  const [invoiceForm, setInvoiceForm] = useState({
    xmlContent: '',
    invoiceNumber: '',
    series: '1',
    invoiceKey: '',
    customerId: 1,
    customerName: 'Hapvida',
    volumes: 1,
    totalValue: '0.00',
    issueDate: new Date().toISOString().split('T')[0],
  });

  const [linkForm, setLinkForm] = useState({
    invoiceNumber: '',
    orderNumber: '',
  });

  const [manifestForm, setManifestForm] = useState({
    carrierName: '',
  });

  const handleImportInvoice = () => {
    importInvoice.mutate(invoiceForm);
  };

  const handleLinkInvoice = () => {
    linkInvoice.mutate(linkForm);
  };

  const handleCreateManifest = () => {
    if (selectedOrders.length === 0) {
      toast({ title: "Erro", description: "Selecione pelo menos um pedido", variant: "destructive" });
      return;
    }
    createManifest.mutate({
      carrierName: manifestForm.carrierName,
      orderIds: selectedOrders,
    });
  };

  const handleDeleteManifests = () => {
    if (selectedManifests.length === 0) {
      toast({ title: "Erro", description: "Selecione pelo menos um romaneio", variant: "destructive" });
      return;
    }
    
    const confirmed = confirm(
      `Tem certeza que deseja excluir ${selectedManifests.length} romaneio(s)?\n\n` +
      `Os pedidos serão liberados e voltarão para a fila de expedição.`
    );
    
    if (confirmed) {
      deleteManifests.mutate({ ids: selectedManifests });
    }
  };

  const handleToggleManifest = (manifestId: number) => {
    setSelectedManifests(prev => 
      prev.includes(manifestId)
        ? prev.filter(id => id !== manifestId)
        : [...prev, manifestId]
    );
  };

  const handleToggleAllManifests = () => {
    if (!manifests) return;
    
    // Filtrar apenas romaneios que não foram expedidos
    const selectableManifests = manifests.filter(m => m.status !== "shipped");
    
    if (selectedManifests.length === selectableManifests.length) {
      setSelectedManifests([]);
    } else {
      setSelectedManifests(selectableManifests.map(m => m.id));
    }
  };

  const toggleOrderSelection = (orderId: number) => {
    setSelectedOrders(prev =>
      prev.includes(orderId)
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  const handleUnlinkInvoice = (invoiceNumber: string) => {
    if (confirm(`Deseja realmente desvincular a NF ${invoiceNumber}?`)) {
      unlinkInvoice.mutate({ invoiceNumber });
    }
  };

  const handleDeleteInvoice = (invoiceNumber: string) => {
    if (confirm(`Deseja realmente excluir a NF ${invoiceNumber}? Esta ação não pode ser desfeita.`)) {
      deleteInvoice.mutate({ invoiceNumber });
    }
  };

  const getShippingStatusBadge = (status: string | null) => {
    const variants: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      awaiting_invoice: { label: "Aguardando NF", variant: "secondary" },
      invoice_linked: { label: "NF Vinculada", variant: "default" },
      in_manifest: { label: "Em Romaneio", variant: "outline" },
      shipped: { label: "Expedido", variant: "destructive" },
    };
    const config = variants[status || 'awaiting_invoice'] || variants.awaiting_invoice;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getInvoiceStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      imported: { label: "Importada", variant: "secondary" },
      linked: { label: "Vinculada", variant: "default" },
      in_manifest: { label: "Em Romaneio", variant: "outline" },
      shipped: { label: "Expedida", variant: "destructive" },
    };
    const config = variants[status] || variants.imported;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getManifestStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      draft: { label: "Rascunho", variant: "secondary" },
      ready: { label: "Pronto", variant: "default" },
      collected: { label: "Coletado", variant: "outline" },
      shipped: { label: "Expedido", variant: "destructive" },
    };
    const config = variants[status] || variants.draft;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="ghost" size="icon" className="text-white hover:text-white hover:bg-white/20">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-white drop-shadow-lg">Módulo de Expedição</h1>
          <p className="text-white/80 drop-shadow">Gerencie pedidos prontos para expedição</p>
        </div>
      </div>

      <Tabs defaultValue="orders" className="space-y-4">
        <TabsList>
          <TabsTrigger value="orders">
            <Package className="h-4 w-4 mr-2" />
            Pedidos
          </TabsTrigger>
          <TabsTrigger value="invoices">
            <FileText className="h-4 w-4 mr-2" />
            Notas Fiscais
          </TabsTrigger>
          <TabsTrigger value="manifests">
            <Truck className="h-4 w-4 mr-2" />
            Romaneios
          </TabsTrigger>
        </TabsList>

        {/* ABA PEDIDOS */}
        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pedidos Prontos para Expedição</CardTitle>
              <CardDescription>
                Pedidos conferidos no Stage (aguardando NF ou com NF vinculada, fora de romaneio)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingOrders ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : orders && orders.length > 0 ? (
                <div className="space-y-2">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-4 flex-1 cursor-pointer" onClick={() => toggleOrderSelection(order.id)}>
                        <input
                          type="checkbox"
                          checked={selectedOrders.includes(order.id)}
                          onChange={() => toggleOrderSelection(order.id)}
                          className="h-4 w-4"
                        />
                        <div>
                          <p className="font-medium">{order.customerOrderNumber}</p>
                          <p className="text-sm text-muted-foreground">
                            {order.customerName} • ID: {order.id}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getShippingStatusBadge(order.shippingStatus)}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Deseja cancelar a expedição do pedido ${order.customerOrderNumber}?\n\nO pedido retornará para o Stage para nova conferência.`)) {
                              cancelShipping.mutate({ orderId: order.id });
                            }
                          }}
                          disabled={cancelShipping.isPending}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  Nenhum pedido pronto para expedição
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA NOTAS FISCAIS */}
        <TabsContent value="invoices" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Importar Nota Fiscal (XML)</CardTitle>
              <CardDescription>Simular importação de XML de NF-e</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Número da NF</Label>
                  <Input
                    value={invoiceForm.invoiceNumber}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceNumber: e.target.value })}
                    placeholder="12345"
                  />
                </div>
                <div>
                  <Label>Série</Label>
                  <Input
                    value={invoiceForm.series}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, series: e.target.value })}
                    placeholder="1"
                  />
                </div>
                <div>
                  <Label>Chave de Acesso (44 dígitos)</Label>
                  <Input
                    value={invoiceForm.invoiceKey}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceKey: e.target.value })}
                    placeholder="35210712345678901234567890123456789012345678"
                    maxLength={44}
                  />
                </div>
                <div>
                  <Label>Cliente</Label>
                  <Input
                    value={invoiceForm.customerName}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, customerName: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Volumes</Label>
                  <Input
                    type="number"
                    value={invoiceForm.volumes}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, volumes: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Valor Total</Label>
                  <Input
                    value={invoiceForm.totalValue}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, totalValue: e.target.value })}
                    placeholder="1500.00"
                  />
                </div>
                <div>
                  <Label>Data de Emissão</Label>
                  <Input
                    type="date"
                    value={invoiceForm.issueDate}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, issueDate: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Conteúdo XML (simplificado)</Label>
                <Textarea
                  value={invoiceForm.xmlContent}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, xmlContent: e.target.value })}
                  placeholder="<nfeProc>...</nfeProc>"
                  rows={3}
                />
              </div>
              <Button onClick={handleImportInvoice} disabled={importInvoice.isPending}>
                {importInvoice.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Importar NF
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Vincular NF a Pedido</CardTitle>
              <CardDescription>Associar nota fiscal importada a um pedido</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Nº da NF</Label>
                  <Input
                    type="text"
                    value={linkForm.invoiceNumber}
                    onChange={(e) => setLinkForm({ ...linkForm, invoiceNumber: e.target.value })}
                    placeholder="12345"
                  />
                </div>
                <div>
                  <Label>Nº do Pedido</Label>
                  <Input
                    type="text"
                    value={linkForm.orderNumber}
                    onChange={(e) => setLinkForm({ ...linkForm, orderNumber: e.target.value })}
                    placeholder="PED-001"
                  />
                </div>
              </div>
              <Button onClick={handleLinkInvoice} disabled={linkInvoice.isPending}>
                {linkInvoice.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Vincular
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notas Fiscais Importadas</CardTitle>
              <CardDescription>Listagem de todas as NFs no sistema</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingInvoices ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : invoices && invoices.length > 0 ? (
                <div className="space-y-2">
                  {invoices.map((invoice) => (
                    <div key={invoice.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium">NF {invoice.invoiceNumber}-{invoice.series}</p>
                        <p className="text-sm text-muted-foreground">
                          {invoice.customerName} • Pedido: {invoice.orderNumber || 'Não vinculado'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Volumes: {invoice.volumes} • Valor: R$ {invoice.totalValue}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {getInvoiceStatusBadge(invoice.status)}
                        {invoice.status === 'linked' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUnlinkInvoice(invoice.invoiceNumber)}
                          >
                            Desvincular
                          </Button>
                        )}
                        {invoice.status === 'imported' && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteInvoice(invoice.invoiceNumber)}
                          >
                            Excluir
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  Nenhuma nota fiscal importada
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA ROMANEIOS */}
        <TabsContent value="manifests" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Criar Romaneio</CardTitle>
              <CardDescription>
                Selecione pedidos na aba "Pedidos" e informe a transportadora
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Transportadora</Label>
                <Input
                  value={manifestForm.carrierName}
                  onChange={(e) => setManifestForm({ ...manifestForm, carrierName: e.target.value })}
                  placeholder="Transportadora XYZ"
                />
              </div>
              <div>
                <Label>Pedidos Selecionados</Label>
                <p className="text-sm text-muted-foreground">
                  {selectedOrders.length > 0
                    ? `${selectedOrders.length} pedido(s) selecionado(s): ${selectedOrders.join(', ')}`
                    : 'Nenhum pedido selecionado (vá para aba Pedidos)'}
                </p>
              </div>
              <Button 
                onClick={handleCreateManifest} 
                disabled={createManifest.isPending || selectedOrders.length === 0}
              >
                {createManifest.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar Romaneio
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Romaneios Criados</CardTitle>
                  <CardDescription>Listagem de todos os romaneios</CardDescription>
                </div>
                {selectedManifests.length > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteManifests}
                    disabled={deleteManifests.isPending}
                  >
                    {deleteManifests.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Excluir Selecionados ({selectedManifests.length})
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loadingManifests ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : manifests && manifests.length > 0 ? (
                <div className="space-y-2">
                  {/* Checkbox Selecionar Todos */}
                  <div className="flex items-center gap-2 p-2 border-b">
                    <input
                      type="checkbox"
                      checked={selectedManifests.length === manifests.filter(m => m.status !== "shipped").length && manifests.filter(m => m.status !== "shipped").length > 0}
                      onChange={handleToggleAllManifests}
                      className="h-4 w-4 cursor-pointer"
                    />
                    <span className="text-sm font-medium">Selecionar Todos</span>
                  </div>
                  
                  {manifests.map((manifest) => (
                    <div key={manifest.id} className="flex items-center gap-3 p-4 border rounded-lg">
                      {/* Checkbox de seleção */}
                      {manifest.status !== "shipped" && (
                        <input
                          type="checkbox"
                          checked={selectedManifests.includes(manifest.id)}
                          onChange={() => handleToggleManifest(manifest.id)}
                          className="h-4 w-4 cursor-pointer"
                        />
                      )}
                      
                      <div className="flex-1">
                        <p className="font-medium">{manifest.manifestNumber}</p>
                        <p className="text-sm text-muted-foreground">
                          {manifest.carrierName} • {manifest.totalOrders} pedido(s) • {manifest.totalVolumes} volume(s)
                        </p>
                        <p className="text-xs text-muted-foreground">
                          ID: {manifest.id}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {getManifestStatusBadge(manifest.status)}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPrintManifestId(manifest.id)}
                        >
                          Imprimir
                        </Button>
                        {manifest.status === 'draft' && (
                          <Button
                            size="sm"
                            onClick={() => finalizeManifest.mutate({ manifestId: manifest.id })}
                            disabled={finalizeManifest.isPending}
                          >
                            {finalizeManifest.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Finalizar
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  Nenhum romaneio criado
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Componente de impressão (oculto) */}
      {printData && (
        <div style={{ display: 'none' }}>
          <ManifestPrint ref={printRef} data={printData} />
        </div>
      )}
    </div>
  );
}
