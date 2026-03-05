import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface OperatorProductivityChartProps {
  data: any[];
}

export function OperatorProductivityChart({ data }: OperatorProductivityChartProps) {
  if (!data || data.length === 0) {
    return null;
  }

  // Agrupar por operador
  const operatorMap = new Map<string, { itemsPicked: number; ordersCompleted: number; avgTime: number; count: number }>();
  
  data.forEach((item: any) => {
    const operator = item.operatorName || item.operator || item.userName || 'Sem operador';
    const items = Number(item.itemsPicked || item.items || item.quantity || 0);
    const orders = Number(item.ordersCompleted || item.orders || 1);
    const time = Number(item.avgPickingTime || item.avgTime || item.time || 0);
    
    const existing = operatorMap.get(operator);
    if (existing) {
      existing.itemsPicked += items;
      existing.ordersCompleted += orders;
      existing.avgTime += time;
      existing.count += 1;
    } else {
      operatorMap.set(operator, {
        itemsPicked: items,
        ordersCompleted: orders,
        avgTime: time,
        count: 1,
      });
    }
  });

  // Converter para array e calcular médias
  const chartData = Array.from(operatorMap.entries())
    .map(([name, stats]) => ({
      name,
      'Itens Separados': stats.itemsPicked,
      'Pedidos Concluídos': stats.ordersCompleted,
      'Tempo Médio (min)': Math.round(stats.avgTime / stats.count),
    }))
    .sort((a, b) => b['Itens Separados'] - a['Itens Separados']);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border rounded-lg shadow-lg p-3">
          <p className="font-semibold text-sm mb-2">{label}</p>
          <p className="text-xs text-blue-600">
            Itens: <span className="font-medium">{payload[0]?.value || 0}</span>
          </p>
          <p className="text-xs text-green-600">
            Pedidos: <span className="font-medium">{payload[1]?.value || 0}</span>
          </p>
          <p className="text-xs text-orange-600">
            Tempo médio: <span className="font-medium">{payload[2]?.value || 0} min</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Produtividade: <span className="font-medium">
              {payload[0]?.value && payload[2]?.value 
                ? (payload[0].value / (payload[2].value / 60)).toFixed(1) 
                : 0} itens/hora
            </span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Produtividade por Operador</CardTitle>
        <CardDescription>
          Desempenho individual de separação e tempo médio
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={chartData}>
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
            <Bar dataKey="Itens Separados" fill="hsl(var(--chart-1))" />
            <Bar dataKey="Pedidos Concluídos" fill="hsl(var(--chart-2))" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
