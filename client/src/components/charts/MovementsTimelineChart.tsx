import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface MovementsTimelineChartProps {
  data: any[];
}

export function MovementsTimelineChart({ data }: MovementsTimelineChartProps) {
  if (!data || data.length === 0) {
    return null;
  }

  // Agrupar movimentações por data
  const dateMap = new Map<string, { entradas: number; saidas: number; total: number }>();
  
  data.forEach((item: any) => {
    const date = item.movementDate || item.createdAt || item.date;
    if (!date) return;
    
    const dateStr = new Date(date).toLocaleDateString('pt-BR');
    const movementType = item.movementType || item.type || 'unknown';
    
    // Mapear tipos reais do banco para entrada/saída
    const isEntrada = (
      movementType === 'in' || 
      movementType === 'entrada' || 
      movementType === 'receiving' ||  // Recebimento = entrada
      movementType === 'return' ||      // Devolução = entrada
      movementType === 'adjustment' ||  // Ajuste positivo = entrada
      (movementType === 'transfer' && item.toLocation && !item.fromLocation) // Transferência de entrada (sem origem)
    );
    
    const isSaida = (
      movementType === 'out' || 
      movementType === 'saida' || 
      movementType === 'picking' ||     // Separação = saída
      movementType === 'disposal' ||    // Descarte = saída
      movementType === 'quality' ||     // Qualidade = saída
      (movementType === 'transfer' && item.fromLocation && !item.toLocation) // Transferência de saída (sem destino)
    );
    
    const existing = dateMap.get(dateStr);
    if (existing) {
      existing.total += 1;
      if (isEntrada) {
        existing.entradas += 1;
      } else if (isSaida) {
        existing.saidas += 1;
      }
    } else {
      dateMap.set(dateStr, {
        entradas: isEntrada ? 1 : 0,
        saidas: isSaida ? 1 : 0,
        total: 1,
      });
    }
  });

  // Converter para array e ordenar por data
  const chartData = Array.from(dateMap.entries())
    .map(([date, stats]) => ({
      date,
      Entradas: stats.entradas,
      Saídas: stats.saidas,
      Total: stats.total,
    }))
    .sort((a, b) => {
      const [dayA, monthA, yearA] = a.date.split('/').map(Number);
      const [dayB, monthB, yearB] = b.date.split('/').map(Number);
      return new Date(yearA, monthA - 1, dayA).getTime() - new Date(yearB, monthB - 1, dayB).getTime();
    });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border rounded-lg shadow-lg p-3">
          <p className="font-semibold text-sm mb-2">{label}</p>
          <p className="text-xs text-green-600">
            Entradas: <span className="font-medium">{payload[0]?.value || 0}</span>
          </p>
          <p className="text-xs text-red-600">
            Saídas: <span className="font-medium">{payload[1]?.value || 0}</span>
          </p>
          <p className="text-xs text-foreground font-medium mt-1">
            Total: {payload[2]?.value || 0}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Movimentações ao Longo do Tempo</CardTitle>
        <CardDescription>
          Histórico de entradas e saídas de estoque por data
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="date" 
              angle={-45}
              textAnchor="end"
              height={80}
              className="text-xs"
            />
            <YAxis className="text-xs" />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line type="monotone" dataKey="Entradas" stroke="hsl(var(--chart-2))" strokeWidth={2} />
            <Line type="monotone" dataKey="Saídas" stroke="hsl(var(--chart-3))" strokeWidth={2} />
            <Line type="monotone" dataKey="Total" stroke="hsl(var(--chart-1))" strokeWidth={2} strokeDasharray="5 5" />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
