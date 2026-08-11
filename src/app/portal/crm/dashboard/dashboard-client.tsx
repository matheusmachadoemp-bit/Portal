"use client";

import { useState } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Section, StatCard } from "@/components/ui/stat-card";
import { formatNumber, formatPercent } from "@/lib/calc";
import { PERIOD_OPTIONS, type PeriodKey } from "@/lib/periods";

type Summary = {
  novosClientes: number;
  clientesAtivos: number;
  clientesRecorrentes: number;
  taxaRecorrencia: number;
  baseTotal: number;
  visitasSite: number;
  conversoes: number;
  taxaConversao: number;
};

export function CrmDashboardClient({
  initialKey,
  initialSummary,
  evolucao,
}: {
  initialKey: PeriodKey;
  initialSummary: Summary;
  evolucao: { date: string; novosClientes: number }[];
}) {
  const [key, setKey] = useState<PeriodKey>(initialKey);
  const [summary, setSummary] = useState(initialSummary);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  async function loadPeriod(newKey: PeriodKey, from?: string, to?: string) {
    const params = new URLSearchParams({ key: newKey });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await fetch(`/api/crm/dashboard?${params.toString()}`);
    setSummary(await res.json());
  }

  function selectPeriod(newKey: PeriodKey) {
    setKey(newKey);
    if (newKey !== "personalizado") loadPeriod(newKey);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => selectPeriod(opt.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${key === opt.key ? "bg-nord-blue text-white" : "bg-nord-panel text-nord-gray hover:text-white"}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {key === "personalizado" && (
        <div className="flex items-center gap-2">
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-sm text-white" />
          <span className="text-nord-gray text-xs">até</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-sm text-white" />
          <button
            onClick={() => loadPeriod("personalizado", customFrom, customTo)}
            disabled={!customFrom || !customTo}
            className="px-3 py-2 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white font-medium"
          >
            Aplicar
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Base total de clientes" value={formatNumber(summary.baseTotal)} icon="Users" />
        <StatCard label="Novos clientes" value={formatNumber(summary.novosClientes)} icon="UserPlus" color="#22c55e" />
        <StatCard label="Clientes recorrentes" value={formatNumber(summary.clientesRecorrentes)} icon="Repeat" />
        <StatCard label="Taxa de recorrência" value={formatPercent(summary.taxaRecorrencia)} icon="TrendingUp" color="#f59e0b" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatCard
          label="Visitas ao site"
          value={summary.visitasSite ? formatNumber(summary.visitasSite) : "—"}
          icon="Globe"
          hint={summary.visitasSite ? undefined : "Lance em Marketing para preencher"}
        />
        <StatCard
          label="Taxa de conversão"
          value={summary.visitasSite ? formatPercent(summary.taxaConversao) : "—"}
          icon="Target"
          hint={summary.visitasSite ? undefined : "Lance em Marketing para preencher"}
        />
      </div>

      <Section title="Novos clientes por dia (últimos 30 dias)">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={evolucao}>
            <defs>
              <linearGradient id="colorNovosClientes" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2952E3" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#2952E3" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
            <XAxis dataKey="date" stroke="#9a9aa2" fontSize={10} interval={3} />
            <YAxis stroke="#9a9aa2" fontSize={11} allowDecimals={false} />
            <Tooltip contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }} />
            <Area type="monotone" dataKey="novosClientes" name="Novos clientes" stroke="#2952E3" fill="url(#colorNovosClientes)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Section>
    </div>
  );
}
