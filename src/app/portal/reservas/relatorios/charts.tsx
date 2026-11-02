"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LabelList } from "recharts";
import { Section } from "@/components/ui/stat-card";
import { makeBarValueLabel, makeColumnValueLabel } from "@/components/ui/bar-value-label";
import { ChartEmptyState, isChartDataEmpty } from "@/components/ui/chart-empty-state";
import { formatNumber, formatPercent } from "@/lib/calc";

type OcupacaoAmbiente = {
  environmentId: string;
  name: string;
  capacity: number;
  totalPessoas: number;
  totalReservas: number;
  ocupacaoPercent: number;
};
type HorarioPico = { hour: string; total: number };

export function RelatoriosCharts({
  ocupacaoPorAmbiente,
  horariosPico,
}: {
  ocupacaoPorAmbiente: OcupacaoAmbiente[];
  horariosPico: HorarioPico[];
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <Section title="Ocupação média por ambiente">
        <p className="text-xs text-nord-gray mb-3">
          Pessoas reservadas (sem contar canceladas/não compareceu) em relação à capacidade do ambiente no
          período — pode passar de 100% quando há mais de um giro de mesa por dia.
        </p>
        {isChartDataEmpty(ocupacaoPorAmbiente, ["ocupacaoPercent"]) ? (
          <ChartEmptyState height={240} />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={ocupacaoPorAmbiente} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
              <XAxis type="number" stroke="#9a9aa2" fontSize={11} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="name" stroke="#9a9aa2" fontSize={10} width={120} />
              <Tooltip
                contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }}
                formatter={(v) => formatPercent(Number(v))}
              />
              <Bar dataKey="ocupacaoPercent" fill="#1464F4" radius={[0, 6, 6, 0]}>
                <LabelList dataKey="ocupacaoPercent" content={makeBarValueLabel((v) => formatPercent(v))} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>

      <Section title="Horários de pico">
        {isChartDataEmpty(horariosPico, ["total"]) ? (
          <ChartEmptyState height={240} />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={horariosPico} margin={{ top: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
              <XAxis dataKey="hour" stroke="#9a9aa2" fontSize={11} />
              <YAxis stroke="#9a9aa2" fontSize={11} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }}
                formatter={(v) => formatNumber(Number(v))}
              />
              <Bar dataKey="total" fill="#22c55e" radius={[6, 6, 0, 0]}>
                <LabelList dataKey="total" content={makeColumnValueLabel((v) => formatNumber(v))} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>
    </div>
  );
}
