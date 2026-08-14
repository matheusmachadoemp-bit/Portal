"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Cell,
} from "recharts";
import { Section, StatCard } from "@/components/ui/stat-card";
import { DynamicIcon } from "@/components/dynamic-icon";
import { formatNumber, formatPercent, formatCurrency } from "@/lib/calc";
import { CRM_PERIOD_OPTIONS, type CrmPeriodKey } from "@/lib/crm";
import type { CrmDashboardData } from "@/lib/crm-dashboard";

const TONE_COLOR: Record<string, string> = {
  danger: "#ef4444",
  warning: "#f59e0b",
  info: "#2952E3",
  success: "#22c55e",
  default: "#9a9aa2",
};

export function CrmDashboardClient({ initialKey, initialData }: { initialKey: CrmPeriodKey; initialData: CrmDashboardData }) {
  const [key, setKey] = useState<CrmPeriodKey>(initialKey);
  const [data, setData] = useState<CrmDashboardData>(initialData);
  const [loading, setLoading] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  async function loadPeriod(newKey: CrmPeriodKey, from?: string, to?: string) {
    setLoading(true);
    const params = new URLSearchParams({ key: newKey });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await fetch(`/api/crm/dashboard?${params.toString()}`);
    setData(await res.json());
    setLoading(false);
  }

  function selectPeriod(newKey: CrmPeriodKey) {
    setKey(newKey);
    if (newKey !== "personalizado") loadPeriod(newKey);
  }

  const { summary, deltas, risco, frequencia, receitaPorTipo, evolucao, insights, oportunidades } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {CRM_PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => selectPeriod(opt.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                key === opt.key ? "bg-nord-blue text-white" : "bg-nord-panel text-nord-gray hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {loading && <span className="text-xs text-nord-gray animate-pulse">Atualizando...</span>}
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

      {/* Central de Oportunidades */}
      {oportunidades.length > 0 && (
        <Section
          title="Oportunidades de Hoje"
          action={<DynamicIcon name="Target" size={16} className="text-nord-blue-light" />}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {oportunidades.map((o) => (
              <Link
                key={o.key}
                href={o.href}
                className="flex items-center gap-3 p-3 rounded-xl border border-nord-border hover:border-nord-blue/60 hover:bg-white/5 transition"
              >
                <div className="w-9 h-9 rounded-lg bg-nord-blue/15 flex items-center justify-center shrink-0">
                  <DynamicIcon name={o.icon} size={17} className="text-nord-blue-light" />
                </div>
                <div className="min-w-0">
                  <p className="text-white text-lg font-semibold leading-none">{formatNumber(o.count)}</p>
                  <p className="text-xs text-nord-gray truncate">{o.label}</p>
                </div>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        <StatCard label="Total de clientes" value={formatNumber(summary.totalClientes)} icon="Users" delta={deltas.totalClientes ?? undefined} />
        <StatCard label="Clientes ativos" value={formatNumber(summary.clientesAtivosPeriodo)} icon="UserCheck" color="#22c55e" delta={deltas.clientesAtivosPeriodo ?? undefined} />
        <StatCard label="Novos clientes" value={formatNumber(summary.novosClientes)} icon="UserPlus" color="#2952E3" delta={deltas.novosClientes ?? undefined} />
        <StatCard label="Clientes recorrentes" value={formatNumber(summary.clientesRecorrentes)} icon="Repeat" delta={deltas.clientesRecorrentes ?? undefined} />
        <StatCard label="Clientes reativados" value={formatNumber(summary.clientesReativados)} icon="Rocket" color="#a855f7" delta={deltas.clientesReativados ?? undefined} />
        <StatCard label="Clientes inativos" value={formatNumber(summary.clientesInativos)} icon="UserX" color="#ef4444" delta={deltas.clientesInativos ? -deltas.clientesInativos : undefined} />
        <StatCard label="Taxa de recompra" value={formatPercent(summary.taxaRecompra)} icon="RefreshCw" color="#f59e0b" delta={deltas.taxaRecompra ?? undefined} />
        <StatCard label="Ticket médio" value={formatCurrency(summary.ticketMedio)} icon="Receipt" delta={deltas.ticketMedio ?? undefined} />
        <StatCard
          label="Frequência média"
          value={summary.frequenciaMedia !== null ? `${formatNumber(summary.frequenciaMedia, 0)} dias` : "—"}
          icon="Clock"
        />
        <StatCard label="LTV médio" value={formatCurrency(summary.ltvMedio)} icon="Wallet" delta={deltas.ltvMedio ?? undefined} />
        <StatCard label="Receita da base" value={formatCurrency(summary.receitaBase)} icon="TrendingUp" color="#22c55e" delta={deltas.receitaBase ?? undefined} />
        <StatCard label="Receita recuperada" value={formatCurrency(summary.receitaRecuperada)} icon="Sparkles" color="#a855f7" delta={deltas.receitaRecuperada ?? undefined} />
      </div>

      {/* Inteligência CRM */}
      {insights.length > 0 && (
        <Section
          title="Inteligência CRM"
          action={<DynamicIcon name="BrainCircuit" size={16} className="text-nord-blue-light" />}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {insights.map((i) => (
              <div key={i.id} className="rounded-xl border border-nord-border p-4 space-y-2" style={{ borderLeft: `3px solid ${TONE_COLOR[i.tone]}` }}>
                <div className="flex items-start gap-2.5">
                  <DynamicIcon name={i.icon} size={16} style={{ color: TONE_COLOR[i.tone] }} className="mt-0.5 shrink-0" />
                  <p className="text-white text-sm font-medium">{i.title}</p>
                </div>
                <p className="text-xs text-nord-gray pl-[26px]">{i.description}</p>
                {i.action && (
                  <div className="pl-[26px]">
                    <Link
                      href={i.action.href}
                      className="inline-flex items-center gap-1 text-xs font-medium text-nord-blue-light hover:text-white"
                    >
                      {i.action.label} <DynamicIcon name="ArrowRight" size={12} />
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Section title="Evolução da base">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={evolucao}>
              <defs>
                <linearGradient id="colorNovos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2952E3" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#2952E3" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorRecorrentes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorReativados" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
              <XAxis dataKey="date" stroke="#9a9aa2" fontSize={10} interval="preserveStartEnd" />
              <YAxis stroke="#9a9aa2" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="novos" name="Novos" stroke="#2952E3" fill="url(#colorNovos)" strokeWidth={2} />
              <Area type="monotone" dataKey="recorrentes" name="Recorrentes" stroke="#22c55e" fill="url(#colorRecorrentes)" strokeWidth={2} />
              <Area type="monotone" dataKey="reativados" name="Reativados" stroke="#a855f7" fill="url(#colorReativados)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Section>

        <Section title="Receita por tipo de cliente">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={receitaPorTipo}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
              <XAxis dataKey="tipo" stroke="#9a9aa2" fontSize={11} />
              <YAxis stroke="#9a9aa2" fontSize={11} tickFormatter={(v) => formatCurrency(v).replace(",00", "")} width={70} />
              <Tooltip
                contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }}
                formatter={(v) => formatCurrency(Number(v))}
              />
              <Bar dataKey="receita" radius={[6, 6, 0, 0]}>
                {receitaPorTipo.map((entry, idx) => (
                  <Cell key={entry.tipo} fill={["#2952E3", "#22c55e", "#a855f7", "#f59e0b"][idx % 4]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Section>

        <Section title="Frequência de compra">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={frequencia} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" horizontal={false} />
              <XAxis type="number" stroke="#9a9aa2" fontSize={11} allowDecimals={false} />
              <YAxis type="category" dataKey="label" stroke="#9a9aa2" fontSize={11} width={110} />
              <Tooltip contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }} />
              <Bar dataKey="count" fill="#2952E3" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>

        <Section title="Clientes em risco">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={risco} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" horizontal={false} />
              <XAxis type="number" stroke="#9a9aa2" fontSize={11} allowDecimals={false} />
              <YAxis type="category" dataKey="label" stroke="#9a9aa2" fontSize={11} width={150} />
              <Tooltip contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }} />
              <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                {risco.map((entry) => (
                  <Cell key={entry.key} fill={TONE_COLOR[entry.tone]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Section>
      </div>
    </div>
  );
}
