"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { formatCurrency } from "@/lib/calc";

export function EntregaChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 32)}>
      <BarChart data={data} layout="vertical" margin={{ left: 24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
        <XAxis type="number" stroke="#9a9aa2" fontSize={11} tickFormatter={(v) => `${v / 1000}k`} />
        <YAxis type="category" dataKey="name" stroke="#9a9aa2" fontSize={11} width={120} />
        <Tooltip contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }} formatter={(v) => formatCurrency(Number(v))} />
        <Bar dataKey="value" fill="#f59e0b" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
