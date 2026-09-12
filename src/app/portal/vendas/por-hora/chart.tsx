"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LabelList } from "recharts";
import { makeColumnValueLabel } from "@/components/ui/bar-value-label";
import { formatCurrency } from "@/lib/calc";

function formatCompact(value: number): string {
  if (!value) return "";
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value));
}

export function PorHoraChart({ data }: { data: { label: string; faturamento: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
        <XAxis dataKey="label" stroke="#9a9aa2" fontSize={10} interval={1} />
        <YAxis stroke="#9a9aa2" fontSize={11} tickFormatter={(v) => `${v / 1000}k`} />
        <Tooltip contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }} formatter={(v) => formatCurrency(Number(v))} />
        <Bar dataKey="faturamento" fill="#2952E3" radius={[4, 4, 0, 0]}>
          <LabelList dataKey="faturamento" content={makeColumnValueLabel(formatCompact)} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
