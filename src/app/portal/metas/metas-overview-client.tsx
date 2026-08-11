"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Award, ChevronRight, Trophy } from "lucide-react";
import { StatCard, Section, Badge, ProgressBar } from "@/components/ui/stat-card";
import { pct } from "@/lib/calc";
import { GOAL_CATEGORIES, GOAL_CATEGORY_LABEL, GOAL_STATUS_LABEL, GOAL_STATUS_TONE, type GoalCategoryKey } from "@/lib/goals";

type GoalDTO = {
  id: string;
  name: string;
  category: string;
  responsavel: string;
  valorMeta: number;
  valorRealizado: number;
  unidade: string;
  startDate: string;
  endDate: string;
  bonificacao: string | null;
  status: string;
  empresaNome: string;
};

const CATEGORY_ROUTE: Record<GoalCategoryKey, string> = {
  GERENCIA: "gerencia",
  SALAO: "salao",
  COZINHA: "cozinha",
  DELIVERY: "delivery",
  MARKETING: "marketing",
  ADMINISTRATIVO: "administrativo",
};

export function MetasOverviewClient({ goals }: { goals: GoalDTO[] }) {
  const [setor, setSetor] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const responsaveis = useMemo(() => [...new Set(goals.map((g) => g.responsavel))].sort(), [goals]);

  const filtered = useMemo(
    () =>
      goals.filter((g) => {
        if (setor && g.category !== setor) return false;
        if (responsavel && g.responsavel !== responsavel) return false;
        if (status && g.status !== status) return false;
        if (from && new Date(g.endDate) < new Date(from)) return false;
        if (to && new Date(g.startDate) > new Date(to)) return false;
        return true;
      }),
    [goals, setor, responsavel, status, from, to]
  );

  const total = filtered.length;
  const concluidas = filtered.filter((g) => g.status === "CONCLUIDA").length;
  const emAndamento = filtered.filter((g) => g.status === "EM_ANDAMENTO" || g.status === "EM_RISCO").length;
  const naoAtingidas = filtered.filter((g) => g.status === "NAO_ATINGIDA").length;
  const percentGeral = total ? (concluidas / total) * 100 : 0;

  const proximasDeAtingir = filtered.filter((g) => g.status === "EM_RISCO");

  const bySector = GOAL_CATEGORIES.map((cat) => {
    const items = filtered.filter((g) => g.category === cat);
    const avgPercent = items.length
      ? items.reduce((sum, g) => sum + pct(g.valorRealizado, g.valorMeta), 0) / items.length
      : 0;
    return {
      category: cat,
      total: items.length,
      concluidas: items.filter((g) => g.status === "CONCLUIDA").length,
      avgPercent,
    };
  });

  const ranking = useMemo(
    () => [...filtered].sort((a, b) => pct(b.valorRealizado, b.valorMeta) - pct(a.valorRealizado, a.valorMeta)).slice(0, 8),
    [filtered]
  );

  return (
    <div className="space-y-6">
      <Link
        href="/portal/metas/acumulada"
        className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 hover:border-amber-500/60 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm text-white font-medium">
          <Trophy size={16} className="text-amber-400" /> Venda Acumulada dos Garçons — ranking e premiações
        </span>
        <ChevronRight size={16} className="text-nord-gray" />
      </Link>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Total de metas" value={String(total)} icon="Target" />
        <StatCard label="Concluídas" value={String(concluidas)} icon="CheckCircle2" color="#22c55e" />
        <StatCard label="Em andamento" value={String(emAndamento)} icon="Clock" color="#2952E3" />
        <StatCard label="Não atingidas" value={String(naoAtingidas)} icon="XCircle" color="#ef4444" />
        <StatCard label="% geral concluído" value={`${percentGeral.toFixed(0)}%`} icon="TrendingUp" color="#f59e0b" />
      </div>

      <Section title="Filtros">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <select value={setor} onChange={(e) => setSetor(e.target.value)} className="input">
            <option value="">Todos os setores</option>
            {GOAL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {GOAL_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
          <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className="input">
            <option value="">Todos os responsáveis</option>
            {responsaveis.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input">
            <option value="">Todos os status</option>
            {Object.entries(GOAL_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" title="De" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" title="Até" />
          </div>
        </div>
      </Section>

      {proximasDeAtingir.length > 0 && (
        <Section title={`Próximas de atingir (${proximasDeAtingir.length})`}>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {proximasDeAtingir.map((g) => (
              <div key={g.id} className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                <p className="text-white text-sm font-medium">{g.name}</p>
                <p className="text-xs text-nord-gray mb-2">
                  {g.responsavel} · {GOAL_CATEGORY_LABEL[g.category as GoalCategoryKey]}
                </p>
                <ProgressBar percent={pct(g.valorRealizado, g.valorMeta)} color="#f59e0b" />
                <p className="text-[11px] text-amber-400 mt-1">{pct(g.valorRealizado, g.valorMeta).toFixed(0)}% atingido</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Desempenho por setor">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {bySector.map((s) => (
            <Link
              key={s.category}
              href={`/portal/metas/${CATEGORY_ROUTE[s.category]}`}
              className="rounded-lg border border-nord-border p-3 hover:border-nord-blue transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-white text-sm font-medium">{GOAL_CATEGORY_LABEL[s.category]}</p>
                <ChevronRight size={14} className="text-nord-gray" />
              </div>
              <ProgressBar percent={s.avgPercent} color={s.avgPercent >= 100 ? "#22c55e" : "#2952E3"} />
              <div className="flex items-center justify-between text-[11px] text-nord-gray mt-1.5">
                <span>
                  {s.concluidas}/{s.total} concluídas
                </span>
                <span>{s.avgPercent.toFixed(0)}% média</span>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      <Section title="Ranking de metas">
        <div className="space-y-2">
          {ranking.map((g, idx) => {
            const percent = pct(g.valorRealizado, g.valorMeta);
            return (
              <div key={g.id} className="flex items-center gap-3 rounded-lg border border-nord-border/60 p-2.5">
                <span className="w-6 text-center text-xs font-semibold text-nord-gray shrink-0">
                  {idx === 0 ? <Award size={14} className="text-amber-400 mx-auto" /> : `${idx + 1}º`}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-white text-xs font-medium truncate">
                      {g.name} <span className="text-nord-gray font-normal">— {g.responsavel}</span>
                    </p>
                    <Badge tone={GOAL_STATUS_TONE[g.status]}>{GOAL_STATUS_LABEL[g.status]}</Badge>
                  </div>
                  <ProgressBar percent={percent} color={percent >= 100 ? "#22c55e" : "#2952E3"} />
                </div>
                <span className="text-xs text-nord-gray w-16 text-right shrink-0">{percent.toFixed(0)}%</span>
              </div>
            );
          })}
          {ranking.length === 0 && <p className="text-sm text-nord-gray text-center py-6">Nenhuma meta encontrada para os filtros selecionados.</p>}
        </div>
      </Section>

      <style jsx global>{`
        .input {
          background: var(--nord-panel);
          border: 1px solid var(--nord-border);
          border-radius: 8px;
          padding: 8px 12px;
          color: white;
          font-size: 13px;
          outline: none;
        }
        .input:focus {
          border-color: var(--nord-blue);
        }
      `}</style>
    </div>
  );
}
