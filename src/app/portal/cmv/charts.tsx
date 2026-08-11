"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, BarChart, Bar } from "recharts";
import { Section } from "@/components/ui/stat-card";

export function CmvCharts({
  dailySeries,
  categoriaChart,
}: {
  dailySeries: { date: string; teorico: number; real: number }[];
  categoriaChart: { name: string; value: number }[];
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div className="xl:col-span-2">
        <Section title="CMV Teórico x Real por dia (últimos 14 dias)">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={dailySeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
              <XAxis dataKey="date" stroke="#9a9aa2" fontSize={11} />
              <YAxis stroke="#9a9aa2" fontSize={11} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }}
                formatter={(v) => `${v}%`}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="teorico" name="CMV Teórico" stroke="#2952E3" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="real" name="CMV Real" stroke="#eab308" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Section>
      </div>

      <div className="xl:col-span-2">
        <Section title="CMV teórico por categoria">
          <ResponsiveContainer width="100%" height={Math.max(160, categoriaChart.length * 36)}>
            <BarChart data={categoriaChart} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
              <XAxis type="number" stroke="#9a9aa2" fontSize={11} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="name" stroke="#9a9aa2" fontSize={11} width={140} />
              <Tooltip
                contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }}
                formatter={(v) => `${v}%`}
              />
              <Bar dataKey="value" fill="#2952E3" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>
      </div>
    </div>
  );
}
