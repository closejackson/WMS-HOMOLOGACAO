import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface TopProductsChartProps {
  data: any[]; // Aceitar dados genéricos do relatório
  limit?: number;
}

export function TopProductsChart({ data, limit = 10 }: TopProductsChartProps) {
  if (!data || data.length === 0) {
    return null;
  }

  // Agrupar por produto e pegar top N
  const productMap = new Map<string, { sku: string; description: string; total: number; reserved: number; available: number }>();
  
  data.forEach((item: any) => {
    const sku = item.productSku || item.productCode || item.sku || 'N/A';
    const description = item.productDescription || item.productName || item.description || 'Sem descrição';
    const quantity = Number(item.totalQuantity || item.quantity || 0);
    const reserved = Number(item.totalReserved || item.reserved || 0);
    const available = Number(item.totalAvailable || item.available || quantity - reserved);
    
    const existing = productMap.get(sku);
    if (existing) {
      existing.total += quantity;
      existing.reserved += reserved;
      existing.available += available;
    } else {
      productMap.set(sku, {
        sku,
        description,
        total: quantity,
        reserved,
        available,
      });
    }
  });

  // Converter para array e ordenar por quantidade total
  const sortedProducts = Array.from(productMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);

  // Preparar dados para o gráfico
  const chartData = sortedProducts.map((item) => ({
    name: item.sku,
    description: item.description.length > 30 ? item.description.substring(0, 30) + '...' : item.description,
    Disponível: item.available,
    Reservado: item.reserved,
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const product = sortedProducts.find(p => p.sku === label);
      return (
        <div className="bg-background border border-border rounded-lg shadow-lg p-3">
          <p className="font-semibold text-sm mb-1">{label}</p>
          <p className="text-xs text-muted-foreground mb-2">{product?.description}</p>
          <p className="text-xs text-green-600">
            Disponível: <span className="font-medium">{payload[0]?.value?.toLocaleString()}</span>
          </p>
          <p className="text-xs text-orange-600">
            Reservado: <span className="font-medium">{payload[1]?.value?.toLocaleString()}</span>
          </p>
          <p className="text-xs text-foreground font-medium mt-1">
            Total: {(payload[0]?.value + payload[1]?.value).toLocaleString()}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Top {limit} Produtos em Estoque</CardTitle>
        <CardDescription>
          Produtos com maior quantidade armazenada (disponível + reservado)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={chartData} layout="horizontal">
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="name" 
              angle={-45}
              textAnchor="end"
              height={100}
              className="text-xs"
            />
            <YAxis className="text-xs" />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="Disponível" stackId="a" fill="#3b82f6" />
            <Bar dataKey="Reservado" stackId="a" fill="#22c55e" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
