import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BlindCheckModal } from "@/components/BlindCheckModal";
import { ImportPreallocationDialog } from "@/components/ImportPreallocationDialog";
import { PageHeader } from "@/components/PageHeader";
import { Package, Eye, Trash2, Search, Filter, Calendar, ClipboardCheck, FileSpreadsheet, Printer } from "lucide-react";
import { toast } from "sonner";
import { useBusinessError } from "@/hooks/useBusinessError";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_COLORS = {
  scheduled: "bg-blue-600 text-white",
  in_progress: "bg-yellow-500 text-white",
  in_quarantine: "bg-orange-500 text-white",
  addressing: "bg-purple-600 text-white",
  completed: "bg-green-600 text-white",
  cancelled: "bg-gray-500 text-white",
};

const STATUS_LABELS = {
  scheduled: "Agendado",
  in_progress: "Em Andamento",
  in_quarantine: "Em Quarentena",
  addressing: "Endereçamento",
  completed: "Concluído",
  cancelled: "Cancelado",
};

export default function Receiving() {
  const [selectedOrders, setSelectedOrders] = useState<number[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [viewItemsOrderId, setViewItemsOrderId] = useState<number | null>(null);
  const [scheduleOrderId, setScheduleOrderId] = useState<number | null>(null);
  const [scheduledDate, setScheduledDate] = useState("");
  const [checkOrderId, setCheckOrderId] = useState<number | null>(null);
  const [importPreallocationOrderId, setImportPreallocationOrderId] = useState<number | null>(null);
  const [labelItem, setLabelItem] = useState<{ productSku: string; batch: string } | null>(null);
  const [labelQuantity, setLabelQuantity] = useState(1);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [batchLabelConfig, setBatchLabelConfig] = useState<{ [key: number]: number }>({});
  const [showBatchLabelModal, setShowBatchLabelModal] = useState(false);
  const [zplPreviewImage, setZplPreviewImage] = useState<string>('');
  
  // Hook de erros de negócio
  const businessError = useBusinessError();

  const { data: orders, refetch } = trpc.receiving.list.useQuery();
  const { data: orderItems } = trpc.receiving.getItems.useQuery(
    { receivingOrderId: viewItemsOrderId! },
    { enabled: !!viewItemsOrderId }
  );

  const { data: checkOrderItems } = trpc.receiving.getItems.useQuery(
    { receivingOrderId: checkOrderId! },
    { enabled: !!checkOrderId }
  );

  const deleteMutation = trpc.receiving.delete.useMutation({
    onSuccess: () => {
      toast.success("Ordem deletada com sucesso");
      refetch();
    },
    onError: (error: any) => {
      const message = error.message;
      
      if (message.includes("não tem permissão") || message.includes("FORBIDDEN")) {
        businessError.showPermissionDenied("deletar ordens de recebimento");
      } else {
        businessError.showGenericError(message);
      }
    },
  });

  const deleteBatchMutation = trpc.receiving.deleteBatch.useMutation({
    onSuccess: () => {
      toast.success("Ordens deletadas com sucesso");
      setSelectedOrders([]);
      refetch();
    },
    onError: (error: any) => {
      const message = error.message;
      
      if (message.includes("não tem permissão") || message.includes("FORBIDDEN")) {
        businessError.showPermissionDenied("deletar ordens de recebimento");
      } else {
        businessError.showGenericError(message);
      }
    },
  });

  const executeAddressingMutation = trpc.preallocation.execute.useMutation({
    onSuccess: (result) => {
      toast.success(result.message);
      refetch();
    },
    onError: (error: any) => {
      const message = error.message;
      
      if (message.includes("não tem permissão") || message.includes("FORBIDDEN")) {
        businessError.showPermissionDenied("executar endereçamento");
      } else {
        businessError.showGenericError(message);
      }
    },
  });

  const generateLabelMutation = trpc.receiving.generateLabel.useMutation({
    onSuccess: (data) => {
      // Abrir PDF em nova aba para impressão
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        // Criar um blob do PDF e abrir
        const byteCharacters = atob(data.image.split(',')[1]);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);
        
        printWindow.location.href = blobUrl;
        
        // Aguardar carregar e imprimir
        printWindow.onload = () => {
          printWindow.print();
        };
      }
      
      toast.success(`${labelQuantity} etiqueta(s) gerada(s) com sucesso`);
      setLabelItem(null);
      setLabelQuantity(1);
    },
    onError: (error) => {
      toast.error(`Erro ao gerar etiqueta: ${error.message}`);
    },
  });

  const generateLabelZPLMutation = trpc.receiving.generateLabelZPL.useMutation({
    onSuccess: (data) => {
      // Armazenar preview para exibição
      if (data.previewImage) {
        setZplPreviewImage(data.previewImage);
      }
      
      // Abrir diálogo de impressão com preview
      if (data.previewImage) {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>Etiqueta ${data.labelCode}</title>
                <style>
                  body {
                    margin: 0;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    background: #f5f5f5;
                  }
                  img {
                    max-width: 100%;
                    height: auto;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                  }
                  @media print {
                    body { background: white; }
                    img { box-shadow: none; }
                  }
                </style>
              </head>
              <body>
                <img src="${data.previewImage}" alt="Etiqueta ${data.labelCode}" />
              </body>
            </html>
          `);
          printWindow.document.close();
          
          // Aguardar imagem carregar e abrir diálogo de impressão
          printWindow.onload = () => {
            setTimeout(() => {
              printWindow.print();
            }, 250);
          };
        }
      }
      
      toast.success(`Etiqueta pronta para impressão!`);
    },
    onError: (error) => {
      toast.error(`Erro ao gerar etiqueta ZPL: ${error.message}`);
    },
  });

  const generateBatchLabelsMutation = trpc.receiving.generateBatchLabels.useMutation({
    onSuccess: (data) => {
      // Abrir PDF em nova aba
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Etiquetas - Med@x</title>
            </head>
            <body style="margin: 0; padding: 0;">
              <embed src="${data.pdf}" type="application/pdf" width="100%" height="100%" />
            </body>
          </html>
        `);
        printWindow.document.close();
      }
      toast.success(`${data.totalLabels} etiqueta(s) gerada(s) com sucesso!`);
      setShowBatchLabelModal(false);
      setSelectedItems([]);
      setBatchLabelConfig({});
    },
    onError: (error) => {
      toast.error(`Erro ao gerar etiquetas em lote: ${error.message}`);
    },
  });

  const scheduleMutation = trpc.receiving.schedule.useMutation({
    onSuccess: () => {
      toast.success("Agendamento realizado com sucesso");
      setScheduleOrderId(null);
      setScheduledDate("");
      refetch();
    },
    onError: (error: any) => {
      const message = error.message;
      
      if (message.includes("Data inválida")) {
        businessError.showInvalidData("Data de agendamento", message);
      } else if (message.includes("não tem permissão") || message.includes("FORBIDDEN")) {
        businessError.showPermissionDenied("agendar recebimentos");
      } else {
        businessError.showGenericError(message);
      }
    },
  });

  const handleDelete = (orderId: number) => {
    if (confirm("Tem certeza que deseja deletar esta ordem de recebimento?")) {
      deleteMutation.mutate({ id: orderId });
    }
  };

  const handleDeleteBatch = () => {
    if (selectedOrders.length === 0) {
      toast.error("Selecione pelo menos uma ordem");
      return;
    }
    if (confirm(`Tem certeza que deseja deletar ${selectedOrders.length} ordem(ns)?`)) {
      deleteBatchMutation.mutate({ ids: selectedOrders });
    }
  };

  const handleSchedule = () => {
    if (!scheduleOrderId || !scheduledDate) {
      toast.error("Selecione uma data e hora");
      return;
    }
    scheduleMutation.mutate({ id: scheduleOrderId, scheduledDate });
  };

  const handleExecuteAddressing = (receivingOrderId: number) => {
    if (confirm("Tem certeza que deseja executar o endereçamento? Isso moverá o estoque de REC para os endereços finais.")) {
      executeAddressingMutation.mutate({ receivingOrderId });
    }
  };

  const toggleSelectAll = () => {
    if (selectedOrders.length === filteredOrders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(filteredOrders.map((o) => o.id));
    }
  };

  const toggleSelect = (orderId: number) => {
    setSelectedOrders((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    );
  };

  // Filtros
  const filteredOrders = (orders || []).filter((order) => {
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    const matchesSearch =
      searchTerm === "" ||
      order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.supplierName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.nfeNumber?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={<ClipboardCheck className="h-8 w-8" />}
        title="Recebimento"
        description="Gerencie ordens de recebimento, confira mercadorias e realize endereçamento"
      />
      <div className="container py-4 sm:py-6">
        {/* Filtros e Ações */}
        <Card className="mb-4 sm:mb-6">
          <CardContent className="pt-4 sm:pt-6">
            <div className="flex flex-col gap-3 sm:gap-4">
              {/* Busca */}
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Buscar por número, fornecedor ou NF-e..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 h-11 bg-white text-gray-800"
                  />
                </div>
              </div>

              {/* Filtro de Status */}
              <div className="w-full sm:w-64">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-11 bg-white text-gray-800">
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4" />
                      <SelectValue placeholder="Status" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Status</SelectItem>
                    <SelectItem value="scheduled">Agendado</SelectItem>
                    <SelectItem value="in_progress">Em Andamento</SelectItem>
                    <SelectItem value="in_quarantine">Em Quarentena</SelectItem>
                    <SelectItem value="addressing">Endereçamento</SelectItem>
                    <SelectItem value="completed">Concluído</SelectItem>
                    <SelectItem value="cancelled">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Deletar em Lote */}
              {selectedOrders.length > 0 && (
                <Button
                  variant="destructive"
                  onClick={handleDeleteBatch}
                  disabled={deleteBatchMutation.isPending}
                  className="h-11 w-full sm:w-auto"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Deletar ({selectedOrders.length})
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tabela de Ordens */}
        <Card>
          <CardHeader>
            <CardTitle>Ordens de Recebimento</CardTitle>
            <CardDescription>
              {filteredOrders.length} ordem(ns) encontrada(s)
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 sm:p-6">
            {/* Mobile: Cards */}
            <div className="block sm:hidden">
              {filteredOrders.length === 0 ? (
                <div className="text-center text-gray-500 py-8 px-4">
                  Nenhuma ordem de recebimento encontrada
                </div>
              ) : (
                <div className="divide-y">
                  {filteredOrders.map((order) => (
                    <div key={order.id} className="p-4">
                      <div className="flex items-start gap-3 mb-3">
                        <Checkbox
                          checked={selectedOrders.includes(order.id)}
                          onCheckedChange={() => toggleSelect(order.id)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-mono font-medium text-sm mb-1">
                            {order.orderNumber}
                          </div>
                          <div className="text-sm text-gray-600 mb-2">
                            {(order as any).clientName || "-"}
                          </div>
                          <Badge className={STATUS_COLORS[order.status as keyof typeof STATUS_COLORS]}>
                            {STATUS_LABELS[order.status as keyof typeof STATUS_LABELS]}
                          </Badge>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm mb-3">
                        {order.nfeNumber && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">NF-e:</span>
                            <span className="font-mono">{order.nfeNumber}</span>
                          </div>
                        )}
                        {order.scheduledDate && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Data Agendada:</span>
                            <span>{format(new Date(order.scheduledDate), "dd/MM/yyyy", { locale: ptBR })}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setScheduleOrderId(order.id)}
                          className="flex-1 min-w-[100px]"
                        >
                          <Calendar className="h-4 w-4 mr-1" />
                          Agendar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setImportPreallocationOrderId(order.id)}
                          disabled={order.status === "completed" || order.status === "cancelled"}
                          className="flex-1 min-w-[100px]"
                        >
                          <FileSpreadsheet className="h-4 w-4 mr-1" />
                          Pré-Aloc.
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCheckOrderId(order.id)}
                          disabled={order.status === "completed" || order.status === "cancelled"}
                          className="flex-1 min-w-[100px]"
                        >
                          <ClipboardCheck className="h-4 w-4 mr-1" />
                          Conferir
                        </Button>
                        {order.status === "addressing" && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleExecuteAddressing(order.id)}
                            className="flex-1 min-w-[100px]"
                          >
                            <Package className="h-4 w-4 mr-1" />
                            Endereçar
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setViewItemsOrderId(order.id)}
                          className="flex-1 min-w-[100px]"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Ver Itens
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(order.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Desktop: Table */}
            <div className="hidden sm:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 bg-white text-gray-700 font-semibold">
                      <Checkbox
                        checked={selectedOrders.length === filteredOrders.length && filteredOrders.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="bg-white text-gray-700 font-semibold">Número</TableHead>
                    <TableHead className="bg-white text-gray-700 font-semibold">Cliente</TableHead>
                    <TableHead className="bg-white text-gray-700 font-semibold">NF-e</TableHead>
                    <TableHead className="bg-white text-gray-700 font-semibold">Data Agendada</TableHead>
                    <TableHead className="bg-white text-gray-700 font-semibold">Status</TableHead>
                    <TableHead className="text-right bg-white text-gray-700 font-semibold">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                        Nenhuma ordem de recebimento encontrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedOrders.includes(order.id)}
                            onCheckedChange={() => toggleSelect(order.id)}
                          />
                        </TableCell>
                        <TableCell className="font-mono font-medium">
                          {order.orderNumber}
                        </TableCell>
                        <TableCell>{(order as any).clientName || "-"}</TableCell>
                        <TableCell>
                          {order.nfeNumber ? (
                            <span className="font-mono text-sm">
                              {order.nfeNumber}
                            </span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>
                          {order.scheduledDate
                            ? format(new Date(order.scheduledDate), "dd/MM/yyyy", { locale: ptBR })
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[order.status as keyof typeof STATUS_COLORS]}>
                            {STATUS_LABELS[order.status as keyof typeof STATUS_LABELS]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setScheduleOrderId(order.id)}
                              title="Agendar previsão de chegada"
                            >
                              <Calendar className="h-4 w-4 text-blue-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setImportPreallocationOrderId(order.id)}
                              title="Importar pré-alocação"
                              disabled={order.status === "completed" || order.status === "cancelled"}
                            >
                              <FileSpreadsheet className="h-4 w-4 text-purple-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setCheckOrderId(order.id)}
                              title="Conferir itens (Conferência Cega)"
                              disabled={order.status === "completed" || order.status === "cancelled"}
                            >
                              <ClipboardCheck className="h-4 w-4 text-green-600" />
                            </Button>
                            {order.status === "addressing" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleExecuteAddressing(order.id)}
                                title="Executar endereçamento"
                              >
                                <Package className="h-4 w-4 text-indigo-600" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setViewItemsOrderId(order.id)}
                              title="Visualizar itens"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(order.id)}
                              disabled={deleteMutation.isPending}
                              title="Deletar ordem"
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Modal de Visualização de Itens */}
        <Dialog open={!!viewItemsOrderId} onOpenChange={() => setViewItemsOrderId(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Itens da Ordem</DialogTitle>
              <DialogDescription>
                Visualize os produtos desta ordem de recebimento
                {selectedItems.length > 0 && (
                  <span className="ml-2 text-blue-600 font-medium">
                    • {selectedItems.length} item(ns) selecionado(s)
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            {selectedItems.length > 0 && (
              <div className="flex justify-end mt-2">
                <Button
                  size="sm"
                  onClick={() => setShowBatchLabelModal(true)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir Selecionadas ({selectedItems.length})
                </Button>
              </div>
            )}
            <div className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={(orderItems?.length || 0) > 0 && selectedItems.length === (orderItems?.filter(i => i.productSku && i.batch).length || 0)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedItems(orderItems?.filter(i => i.productSku && i.batch).map(i => i.id) || []);
                          } else {
                            setSelectedItems([]);
                          }
                        }}
                        title="Selecionar todos os itens"
                      />
                    </TableHead>
                    <TableHead className="bg-white text-gray-700 font-semibold">Produto</TableHead>
                    <TableHead className="bg-white text-gray-700 font-semibold">SKU</TableHead>
                    <TableHead className="bg-white text-gray-700 font-semibold">Lote</TableHead>
                    <TableHead className="text-right bg-white text-gray-700 font-semibold">Qtd Esperada</TableHead>
                    <TableHead className="text-right bg-white text-gray-700 font-semibold">Qtd Recebida</TableHead>
                    <TableHead className="text-right bg-white text-gray-700 font-semibold">Qtd Endereçada</TableHead>
                    <TableHead className="bg-white text-gray-700 font-semibold">Status</TableHead>
                    <TableHead className="text-center bg-white text-gray-700 font-semibold">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!orderItems || orderItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-gray-500 py-4">
                        Nenhum item encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    orderItems.map((item, index) => (
                      <TableRow 
                        key={`${item.id}-${index}`}
                        className={selectedItems.includes(item.id) ? "bg-blue-50" : ""}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedItems.includes(item.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedItems([...selectedItems, item.id]);
                              } else {
                                setSelectedItems(selectedItems.filter(id => id !== item.id));
                              }
                            }}
                            disabled={!item.productSku || !item.batch}
                            title={`Selecionar item ${item.productSku}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {item.productDescription || "-"}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {item.productSku || "-"}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {item.batch || "-"}
                        </TableCell>
                        <TableCell className="text-right">{item.expectedQuantity}</TableCell>
                        <TableCell className="text-right">{item.receivedQuantity}</TableCell>
                        <TableCell className="text-right">{item.addressedQuantity}</TableCell>
                        <TableCell>
                          <Badge className="text-xs bg-gray-500 text-white">
                            {item.status || "Pendente"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setLabelItem({ productSku: item.productSku || '', batch: item.batch || '' })}
                            disabled={!item.productSku || !item.batch}
                            title="Imprimir Etiqueta"
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal de Agendamento */}
        <Dialog open={!!scheduleOrderId} onOpenChange={() => setScheduleOrderId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Agendar Previsão de Chegada</DialogTitle>
              <DialogDescription>
                Informe a data e hora prevista para chegada do veículo de entrega
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Data e Hora Prevista
                </label>
                <Input
                  type="datetime-local"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setScheduleOrderId(null)}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSchedule}
                  disabled={scheduleMutation.isPending || !scheduledDate}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Confirmar Agendamento
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal de Conferência Cega */}
        {checkOrderId && checkOrderItems && (
          <BlindCheckModal
            open={!!checkOrderId}
            onClose={() => {
              setCheckOrderId(null);
              refetch();
            }}
            receivingOrderId={checkOrderId}
            items={(checkOrderItems || []).map(item => ({
              ...item,
              expiryDate: item.expiryDate instanceof Date ? item.expiryDate.toISOString().split('T')[0] : item.expiryDate,
            }))}
          />
        )}

        {/* Modal de Importação de Pré-Alocação */}
        {importPreallocationOrderId && (
          <ImportPreallocationDialog
            receivingOrderId={importPreallocationOrderId}
            open={!!importPreallocationOrderId}
            onOpenChange={(open) => {
              if (!open) setImportPreallocationOrderId(null);
            }}
            onSuccess={() => {
              refetch();
            }}
          />
        )}

        {/* Modal de Impressão de Etiqueta */}
        <Dialog open={!!labelItem} onOpenChange={() => {
          setLabelItem(null);
          setZplPreviewImage('');
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Imprimir Etiqueta de Produto</DialogTitle>
              <DialogDescription>
                Etiqueta no formato Code-128: {labelItem?.productSku}{labelItem?.batch}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Quantidade de Etiquetas
                </label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={labelQuantity}
                  onChange={(e) => setLabelQuantity(parseInt(e.target.value) || 1)}
                  className="w-full"
                />
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600 mb-2">Preview:</p>
                <div className="bg-white p-4 border rounded text-center">
                  {zplPreviewImage ? (
                    <div className="flex flex-col items-center gap-2">
                      <img 
                        src={zplPreviewImage} 
                        alt="Preview da etiqueta ZPL" 
                        className="max-w-full h-auto border-2 border-blue-200 rounded"
                      />
                      <p className="text-xs text-blue-600 font-medium">Preview Zebra (ZPL)</p>
                    </div>
                  ) : (
                    <div>
                      <p className="font-mono text-lg">{labelItem?.productSku}{labelItem?.batch}</p>
                      <p className="text-xs text-gray-500 mt-2">Código de barras Code-128</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setLabelItem(null)}
                >
                  Cancelar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (labelItem) {
                      generateLabelZPLMutation.mutate({
                        productSku: labelItem.productSku,
                        batch: labelItem.batch,
                        quantity: labelQuantity,
                      });
                    }
                  }}
                  disabled={generateLabelZPLMutation.isPending}
                  className="border-blue-500 text-blue-600 hover:bg-blue-50"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  {generateLabelZPLMutation.isPending ? "Gerando..." : "Zebra (ZPL)"}
                </Button>
                <Button
                  onClick={() => {
                    if (labelItem) {
                      generateLabelMutation.mutate({
                        productSku: labelItem.productSku,
                        batch: labelItem.batch,
                        quantity: labelQuantity,
                      });
                    }
                  }}
                  disabled={generateLabelMutation.isPending}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  {generateLabelMutation.isPending ? "Gerando..." : "PDF"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal de Configuração de Impressão em Lote */}
        <Dialog open={showBatchLabelModal} onOpenChange={() => setShowBatchLabelModal(false)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Configurar Impressão em Lote</DialogTitle>
              <DialogDescription>
                Configure a quantidade de cópias para cada item selecionado
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              {orderItems?.filter(item => selectedItems.includes(item.id)).map(item => (
                <div key={item.id} className="flex items-center gap-4 p-4 border rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium">{item.productDescription || "Produto"}</p>
                    <p className="text-sm text-gray-600 font-mono">
                      SKU: {item.productSku} | Lote: {item.batch}
                    </p>
                  </div>
                  <div className="w-32">
                    <label className="text-xs text-gray-600 block mb-1">Cópias</label>
                    <Input
                      type="number"
                      min="1"
                      max="100"
                      value={batchLabelConfig[item.id] || 1}
                      onChange={(e) => {
                        const quantity = parseInt(e.target.value) || 1;
                        setBatchLabelConfig({ ...batchLabelConfig, [item.id]: quantity });
                      }}
                      className="w-full"
                    />
                  </div>
                </div>
              ))}
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm font-medium text-blue-900">
                  Total de etiquetas: {Object.values(batchLabelConfig).reduce((sum, qty) => sum + qty, selectedItems.length)}
                </p>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setShowBatchLabelModal(false)}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => {
                    const items = orderItems?.filter(item => selectedItems.includes(item.id)).map(item => ({
                      productSku: item.productSku || '',
                      batch: item.batch || '',
                      quantity: batchLabelConfig[item.id] || 1,
                    })) || [];
                    
                    if (items.length > 0) {
                      generateBatchLabelsMutation.mutate({ items });
                    }
                  }}
                  disabled={generateBatchLabelsMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir {labelQuantity > 1 ? `${labelQuantity} Etiquetas` : 'Etiqueta'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal de Erros de Negócio */}
        {businessError.ErrorModal}
      </div>
    </div>
  );
}
