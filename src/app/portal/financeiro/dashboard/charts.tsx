"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import { Section } from "@/components/ui/stat-card";
import { formatCurrency } from "@/lib/calc";

export function FinanceCharts({
  dailyFlow,
  despesasChart,
  receitasChart,
}: {
  dailyFlow: { date: string; entradas: number; saidas: number }[];
  despesasChart: { name: string; value: number }[];
  receitasChart: { name: string; value: number }[];
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div className="xl:col-span-2">
        <Section title="Fluxo de caixa diário (últimos 14 dias)">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={dailyFlow}>
              <defs>
                <linearGradient id="colorEntradas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorSaidas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
              <XAxis dataKey="date" stroke="#9a9aa2" fontSize={11} />
              <YAxis stroke="#9a9aa2" fontSize={11} tickFormatter={(v) => `${v / 1000}k`} />
              <Tooltip
                contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }}
                formatter={(v) => formatCurrency(Number(v))}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="entradas" name="Entradas" stroke="#22c55e" fill="url(#colorEntradas)" strokeWidth={2} />
              <Area type="monotone" dataKey="saidas" name="Saídas" stroke="#ef4444" fill="url(#colorSaidas)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Section>
      </div>

      <Section title="Despesas por categoria (mês atual)">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={despesasChart} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
            <XAxis type="number" stroke="#9a9aa2" fontSize={11} tickFormatter={(v) => `${v / 1000}k`} />
            <YAxis type="category" dataKey="name" stroke="#9a9aa2" fontSize={10} width={140} />
            <Tooltip
              contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }}
              formatter={(v) => formatCurrency(Number(v))}
            />
            <Bar dataKey="value" fill="#ef4444" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Section>

      <Section title="Receitas por categoria (mês atual)">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={receitasChart} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
            <XAxis type="number" stroke="#9a9aa2" fontSize={11} tickFormatter={(v) => `${v / 1000}k`} />
            <YAxis type="category" dataKey="name" stroke="#9a9aa2" fontSize={10} width={140} />
            <Tooltip
              contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }}
              formatter={(v) => formatCurrency(Number(v))}
            />
            <Bar dataKey="value" fill="#22c55e" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Section>
    </div>
  );
}
