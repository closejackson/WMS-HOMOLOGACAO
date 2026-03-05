import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface StockByZoneChartProps {
  data: any[]; // Aceitar dados genéricos do relatório
}

const COLORS = [
  '#3b82f6', // blue-500
  '#22c55e', // green-500
  '#f97316', // orange-500
  '#a855f7', // purple-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#eab308', // yellow-500
];

export function StockByZoneChart({ data }: StockByZoneChartProps) {
  if (!data || data.length === 0) {
    return null;
  }

  // Agrupar dados por zona
  const zoneMap = new Map<string, { total: number; available: number; locations: Set<string> }>();
  
  data.forEach((item: any) => {
    const zoneName = item.zoneName || item.zone || 'Sem Zona';
    const quantity = Number(item.totalQuantity || item.quantity || 0);
    const available = Number(item.totalAvailable || item.available || 0);
    const location = item.locationCode || item.locationId;
    
    const existing = zoneMap.get(zoneName);
    if (existing) {
      existing.total += quantity;
      existing.available += available;
      if (location) existing.locations.add(location);
    } else {
      zoneMap.set(zoneName, {
        total: quantity,
        available,
        locations: new Set(location ? [location] : []),
      });
    }
  });

  // Preparar dados para o gráfico
  const chartData = Array.from(zoneMap.entries()).map(([name, stats]) => ({
    name,
    value: stats.total,
    available: stats.available,
    locations: stats.locations.size,
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-background border border-border rounded-lg shadow-lg p-3">
          <p className="font-semibold text-sm mb-1">{data.name}</p>
          <p className="text-xs text-muted-foreground">
            Total: <span className="font-medium text-foreground">{data.value.toLocaleString()}</span> unidades
          </p>
          <p className="text-xs text-muted-foreground">
            Disponível: <span className="font-medium text-green-600">{data.available.toLocaleString()}</span> unidades
          </p>
          <p className="text-xs text-muted-foreground">
            Endereços: <span className="font-medium text-foreground">{data.locations}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Distribuição de Estoque por Zona</CardTitle>
        <CardDescription>
          Visualização da ocupação de estoque em cada zona do armazém
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              outerRadius={100}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
