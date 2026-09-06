"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { formatCurrency } from "@/lib/calc";

/** "YYYY-MM-DD" -> "dd/MM", sem passar por Date (evita o fuso mudar o dia). */
function formatDiaLabel(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${day}/${month}`;
}

export function DesempenhoChart({ serie }: { serie: { data: string; faturamento: number }[] }) {
  const chartData = serie.map((s) => ({ dia: formatDiaLabel(s.data), faturamento: s.faturamento }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
        <XAxis dataKey="dia" stroke="#9a9aa2" fontSize={11} />
        <YAxis stroke="#9a9aa2" fontSize={11} tickFormatter={(v) => `${v / 1000}k`} />
        <Tooltip
          contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }}
          labelStyle={{ color: "#fff" }}
          formatter={(v) => formatCurrency(Number(v))}
        />
        <Bar dataKey="faturamento" fill="#2952E3" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
