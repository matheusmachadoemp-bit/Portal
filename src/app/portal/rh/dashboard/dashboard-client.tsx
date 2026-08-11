"use client";

import { StatCard, Section, Badge } from "@/components/ui/stat-card";
import { DynamicIcon } from "@/components/dynamic-icon";
import { formatNumber, formatPercent, formatCurrency } from "@/lib/calc";
import { RhTabs } from "../rh-tabs";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import type { HrInsight } from "@/lib/rh-insights";

const TONE_BADGE: Record<HrInsight["tone"], "success" | "warning" | "danger" | "info"> = {
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
};

const TONE_ICON: Record<HrInsight["tone"], string> = {
  success: "TrendingUp",
  warning: "AlertTriangle",
  danger: "AlertOctagon",
  info: "Sparkles",
};

export function DashboardClient({
  kpis,
  turnoverMensal,
  admissoesXDemissoes,
  custosFolha,
  faltasPorSetor,
  atrasosPorColaborador,
  insights,
}: {
  kpis: {
    totalColaboradores: number;
    ativos: number;
    ferias: number;
    afastados: number;
    desligamentosMes: number;
    admissoesMes: number;
    turnoverMes: number;
    faltasMes: number;
    atrasosMes: number;
    advertenciasMes: number;
    suspensoesMes: number;
    horasTrabalhadasMes: number;
    bancoHorasMes: number;
    tempoMedioAnos: number;
  };
  turnoverMensal: { mes: string; turnover: number }[];
  admissoesXDemissoes: { mes: string; admissoes: number; demissoes: number }[];
  custosFolha: { mes: string; valor: number }[];
  faltasPorSetor: { setor: string; faltas: number }[];
  atrasosPorColaborador: { nome: string; atrasos: number }[];
  insights: HrInsight[];
}) {
  return (
    <div className="space-y-6">
      <RhTabs />

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
        <StatCard label="Total colaboradores" value={formatNumber(kpis.totalColaboradores)} icon="Users" />
        <StatCard label="Ativos" value={formatNumber(kpis.ativos)} icon="UserCheck" color="#22c55e" />
        <StatCard label="Férias" value={formatNumber(kpis.ferias)} icon="Palmtree" color="#2952E3" />
        <StatCard label="Afastados" value={formatNumber(kpis.afastados)} icon="UserMinus" color="#eab308" />
        <StatCard label="Desligamentos (mês)" value={formatNumber(kpis.desligamentosMes)} icon="UserX" color="#ef4444" />
        <StatCard label="Admissões (mês)" value={formatNumber(kpis.admissoesMes)} icon="UserPlus" color="#22c55e" />
        <StatCard label="Turnover (mês)" value={formatPercent(kpis.turnoverMes)} icon="Repeat" color="#ef4444" />
        <StatCard label="Faltas (mês)" value={formatNumber(kpis.faltasMes)} icon="UserX" color="#ef4444" />
        <StatCard label="Atrasos (mês)" value={formatNumber(kpis.atrasosMes)} icon="Clock" color="#eab308" />
        <StatCard label="Advertências (mês)" value={formatNumber(kpis.advertenciasMes)} icon="AlertTriangle" color="#f97316" />
        <StatCard label="Suspensões (mês)" value={formatNumber(kpis.suspensoesMes)} icon="Ban" color="#ef4444" />
        <StatCard label="Horas trabalhadas (mês)" value={`${formatNumber(kpis.horasTrabalhadasMes, 0)}h`} icon="Clock4" />
        <StatCard
          label="Banco de horas (mês)"
          value={`${kpis.bancoHorasMes >= 0 ? "+" : ""}${formatNumber(kpis.bancoHorasMes, 0)}h`}
          icon="Hourglass"
          color={kpis.bancoHorasMes < 0 ? "#ef4444" : "#22c55e"}
        />
        <StatCard label="Tempo médio de empresa" value={`${formatNumber(kpis.tempoMedioAnos, 1)} anos`} icon="CalendarClock" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Section title="Turnover mensal">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={turnoverMensal}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
              <XAxis dataKey="mes" stroke="#9a9aa2" fontSize={11} />
              <YAxis stroke="#9a9aa2" fontSize={11} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }} formatter={(v) => `${v}%`} />
              <Line type="monotone" dataKey="turnover" name="Turnover" stroke="#ef4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Section>

        <Section title="Admissões x Demissões">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={admissoesXDemissoes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
              <XAxis dataKey="mes" stroke="#9a9aa2" fontSize={11} />
              <YAxis stroke="#9a9aa2" fontSize={11} />
              <Tooltip contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="admissoes" name="Admissões" fill="#22c55e" radius={[6, 6, 0, 0]} />
              <Bar dataKey="demissoes" name="Demissões" fill="#ef4444" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>

        <Section title="Faltas por setor (mês atual)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={faltasPorSetor} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
              <XAxis type="number" stroke="#9a9aa2" fontSize={11} />
              <YAxis type="category" dataKey="setor" stroke="#9a9aa2" fontSize={10} width={100} />
              <Tooltip contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }} />
              <Bar dataKey="faltas" fill="#ef4444" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>

        <Section title="Atrasos por colaborador (top 10, mês atual)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={atrasosPorColaborador} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
              <XAxis type="number" stroke="#9a9aa2" fontSize={11} />
              <YAxis type="category" dataKey="nome" stroke="#9a9aa2" fontSize={10} width={100} />
              <Tooltip contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }} />
              <Bar dataKey="atrasos" fill="#eab308" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>

        <div className="xl:col-span-2">
          <Section title="Custos de folha (últimos 6 meses)">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={custosFolha}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
                <XAxis dataKey="mes" stroke="#9a9aa2" fontSize={11} />
                <YAxis stroke="#9a9aa2" fontSize={11} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }} formatter={(v) => formatCurrency(Number(v))} />
                <Bar dataKey="valor" name="Custo" fill="#2952E3" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Section>
        </div>
      </div>

      <Section title="Inteligência RH" action={<Badge tone="info">{insights.length} insight{insights.length !== 1 ? "s" : ""}</Badge>}>
        {insights.length === 0 && <p className="text-sm text-nord-gray">Sem insights relevantes no momento — os dados estão dentro do esperado.</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {insights.map((insight, i) => (
            <div key={i} className="rounded-xl border border-nord-border p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DynamicIcon name={TONE_ICON[insight.tone]} size={14} className="text-nord-blue-light" />
                  <span className="text-white text-sm font-medium">{insight.title}</span>
                </div>
                <Badge tone={TONE_BADGE[insight.tone]}>{insight.tone}</Badge>
              </div>
              <p className="text-xs text-nord-gray">{insight.detail}</p>
              <p className="text-xs text-nord-blue-light">Sugestão: {insight.action}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
