"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { formatCurrency } from "@/lib/calc";

export function FaturamentoComparisonChart({ data }: { data: { dia: number; atual: number; anterior: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--nord-border)" />
        <XAxis dataKey="dia" stroke="#9a9aa2" fontSize={11} tickFormatter={(v) => `Dia ${v}`} />
        <YAxis stroke="#9a9aa2" fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
        <Tooltip
          contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }}
          formatter={(v) => formatCurrency(Number(v))}
          labelFormatter={(v) => `Dia ${v}`}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="atual" name="Período atual" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
        <Line type="monotone" dataKey="anterior" name="Período de comparação" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
