"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { Section } from "@/components/ui/stat-card";
import { formatCurrency } from "@/lib/calc";

const COLORS = ["#2952E3", "#4d70ff"];

export function DashboardCharts({
  dailySeries,
  channelData,
  monthlyEvolution,
}: {
  dailySeries: { date: string; total: number; delivery: number; salao: number }[];
  channelData: { name: string; value: number }[];
  monthlyEvolution: { month: string; total: number }[];
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div className="xl:col-span-2">
        <Section title="Faturamento diário (mês atual)">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={dailySeries}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2952E3" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#2952E3" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
              <XAxis dataKey="date" stroke="#9a9aa2" fontSize={11} />
              <YAxis stroke="#9a9aa2" fontSize={11} tickFormatter={(v) => `${v / 1000}k`} />
              <Tooltip
                contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }}
                labelStyle={{ color: "#fff" }}
                formatter={(v) => formatCurrency(Number(v))}
              />
              <Area type="monotone" dataKey="total" stroke="#2952E3" fill="url(#colorTotal)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Section>
      </div>

      <Section title="Faturamento por canal">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={channelData}
              dataKey="value"
              nameKey="name"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={3}
            >
              {channelData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Legend wrapperStyle={{ fontSize: 12, color: "#9a9aa2" }} />
            <Tooltip
              contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }}
              formatter={(v) => formatCurrency(Number(v))}
            />
          </PieChart>
        </ResponsiveContainer>
      </Section>

      <div className="xl:col-span-3">
        <Section title="Evolução mensal do faturamento">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthlyEvolution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
              <XAxis dataKey="month" stroke="#9a9aa2" fontSize={11} />
              <YAxis stroke="#9a9aa2" fontSize={11} tickFormatter={(v) => `${v / 1000}k`} />
              <Tooltip
                contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }}
                formatter={(v) => formatCurrency(Number(v))}
              />
              <Bar dataKey="total" fill="#2952E3" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>
      </div>
    </div>
  );
}
