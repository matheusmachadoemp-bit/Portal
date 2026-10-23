"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";
import { Copy, Eye } from "lucide-react";
import { Section, Badge, StatCard } from "@/components/ui/stat-card";
import { ChartEmptyState, isChartDataEmpty } from "@/components/ui/chart-empty-state";
import { makeBarValueLabel, makeColumnValueLabel } from "@/components/ui/bar-value-label";
import { formatNumber } from "@/lib/calc";
import { FEEDBACK_PRIORIDADE_COLOR, FEEDBACK_PRIORIDADE_LABEL, formatHoras, resolveModuloLabel } from "./labels";
import type { DashboardResponse, FeedbackListItem } from "./types";

const PRIORIDADE_ORDER = ["BAIXA", "MEDIA", "ALTA", "CRITICA"];

function formatMesTick(mes: string): string {
  const d = new Date(`${mes}-01T00:00:00`);
  if (Number.isNaN(d.getTime())) return mes;
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

/**
 * Aba "Relatórios" — gráficos e indicadores agregados (`GET /api/feedback/dashboard`, já
 * carregado pelo componente pai) + "Problemas recorrentes" (busca própria, lazy: só dispara
 * quando esta aba é exibida, ver comentário abaixo).
 */
export function FeedbackRelatorios({
  dashboard,
  loading,
  fromISO,
  toISO,
  refreshToken,
  onOpenDetail,
}: {
  dashboard: DashboardResponse | null;
  loading: boolean;
  fromISO?: string;
  toISO?: string;
  refreshToken: number;
  onOpenDetail: (id: string) => void;
}) {
  if (loading && !dashboard) {
    return <div className="nord-card p-8 text-center text-sm text-nord-gray">Carregando relatórios...</div>;
  }
  if (!dashboard) {
    return <div className="nord-card p-8 text-center text-sm text-nord-danger">Não foi possível carregar os relatórios.</div>;
  }

  const implementadas = dashboard.porStatus.find((s) => s.tipo === "SUGESTAO" && s.status === "IMPLEMENTADA")?.count ?? 0;
  const prioridadeData = PRIORIDADE_ORDER.map((p) => ({
    prioridade: FEEDBACK_PRIORIDADE_LABEL[p] ?? p,
    count: dashboard.porPrioridade.find((row) => row.prioridade === p)?.count ?? 0,
    cor: FEEDBACK_PRIORIDADE_COLOR[p],
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          label="Tempo médio de correção"
          value={dashboard.kpis.tempoMedioResolucaoHoras != null ? formatHoras(dashboard.kpis.tempoMedioResolucaoHoras) : "—"}
          hint={dashboard.kpis.tempoMedioResolucaoHoras == null ? "Sem dados suficientes" : undefined}
          icon="Timer"
          color="#3b82f6"
        />
        <StatCard
          label="Melhorias implementadas"
          value={formatNumber(implementadas)}
          icon="Sparkles"
          color="#22c55e"
        />
      </div>

      <Section title="Bugs por módulo (top 10)">
        {dashboard.porModulo.length === 0 ? (
          <ChartEmptyState height={Math.max(180, 220)} />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(220, dashboard.porModulo.length * 36)}>
            <BarChart data={dashboard.porModulo} layout="vertical" margin={{ left: 24, right: 32 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" horizontal={false} />
              <XAxis type="number" stroke="#9a9aa2" fontSize={11} allowDecimals={false} />
              <YAxis type="category" dataKey="modulo" stroke="#9a9aa2" fontSize={11} width={160} />
              <Tooltip contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }} />
              <Bar dataKey="count" name="Bugs" fill="#ef4444" radius={[0, 6, 6, 0]}>
                <LabelList dataKey="count" content={makeBarValueLabel(formatNumber)} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Section title="Ranking de módulos com mais falhas">
          {dashboard.porModulo.length === 0 ? (
            <p className="text-sm text-nord-gray text-center py-6">Nenhum bug registrado no período selecionado.</p>
          ) : (
            <ol className="space-y-2">
              {dashboard.porModulo.map((m, idx) => (
                <li key={m.modulo} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-nord-panel border border-nord-border flex items-center justify-center text-[11px] text-nord-gray shrink-0">
                    {idx + 1}
                  </span>
                  <span className="flex-1 text-sm text-white truncate" title={m.modulo}>{m.modulo}</span>
                  <span className="text-sm text-nord-gray shrink-0">{formatNumber(m.count)}</span>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section title="Bugs por prioridade">
          {isChartDataEmpty(prioridadeData, ["count"]) ? (
            <ChartEmptyState height={220} />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={prioridadeData} margin={{ top: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
                <XAxis dataKey="prioridade" stroke="#9a9aa2" fontSize={11} />
                <YAxis stroke="#9a9aa2" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }} />
                <Bar dataKey="count" name="Bugs" radius={[6, 6, 0, 0]}>
                  {prioridadeData.map((p) => (
                    <Cell key={p.prioridade} fill={p.cor} />
                  ))}
                  <LabelList dataKey="count" content={makeColumnValueLabel(formatNumber)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Section>
      </div>

      <Section title="Evolução mensal de relatos">
        {isChartDataEmpty(dashboard.evolucaoMensal, ["bugs", "sugestoes"]) ? (
          <ChartEmptyState height={260} />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={dashboard.evolucaoMensal}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
              <XAxis dataKey="mes" tickFormatter={formatMesTick} stroke="#9a9aa2" fontSize={11} />
              <YAxis stroke="#9a9aa2" fontSize={11} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }}
                labelFormatter={(v) => formatMesTick(String(v))}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="bugs" name="Bugs" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey="sugestoes" name="Sugestões" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>

      <ProblemasRecorrentes fromISO={fromISO} toISO={toISO} refreshToken={refreshToken} onOpenDetail={onOpenDetail} />
    </div>
  );
}

/**
 * "Problemas recorrentes" — relatos marcados (`possivelDuplicataDeId`) como possível duplicata
 * de outro relato já existente (ver `findPossibleDuplicate`, `src/lib/feedback-server.ts`).
 * Decisão de design: em vez de buscar `duplicatas[]` (a relação reversa, só disponível no
 * detalhe de CADA relato individual — custaria uma chamada por item), busca a listagem geral
 * (até 300, sem filtro de tipo/status) e filtra client-side quem tem `possivelDuplicataDeId`
 * preenchido — cada linha abre o detalhe do próprio relato, que mostra com qual protocolo
 * original ele foi comparado (`report.possivelDuplicataDe`). Busca lazy: só dispara quando esta
 * aba (Relatórios) é exibida, já que o componente só monta nesse momento.
 */
function ProblemasRecorrentes({
  fromISO,
  toISO,
  refreshToken,
  onOpenDetail,
}: {
  fromISO?: string;
  toISO?: string;
  refreshToken: number;
  onOpenDetail: (id: string) => void;
}) {
  const [items, setItems] = useState<FeedbackListItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const params = new URLSearchParams({ take: "300" });
        if (fromISO) params.set("from", fromISO);
        if (toISO) params.set("to", toISO);
        const res = await fetch(`/api/feedback?${params.toString()}`);
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(json?.error ?? "Não foi possível carregar os problemas recorrentes.");
          return;
        }
        const reports: FeedbackListItem[] = Array.isArray(json?.reports) ? json.reports : [];
        setItems(reports.filter((r) => !!r.possivelDuplicataDeId));
      } catch {
        if (!cancelled) setLoadError("Falha de conexão. Verifique sua internet e tente novamente.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [fromISO, toISO, refreshToken]);

  return (
    <Section title="Problemas recorrentes (possíveis duplicatas)">
      {loading && !items ? (
        <div className="p-6 text-center text-sm text-nord-gray">Carregando...</div>
      ) : loadError ? (
        <div className="p-6 text-center text-sm text-nord-danger">{loadError}</div>
      ) : items && items.length > 0 ? (
        <div className="space-y-2">
          {items.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 border-b border-nord-border/50 pb-2 last:border-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white flex items-center gap-1.5 truncate">
                  <Copy size={12} className="text-nord-gray shrink-0" />
                  <span className="font-mono text-xs text-nord-gray">{r.protocolo}</span>
                  <span className="truncate">{r.titulo}</span>
                </p>
                <p className="text-xs text-nord-gray mt-0.5">
                  {resolveModuloLabel(r)} · {format(new Date(r.createdAt), "dd/MM/yyyy")}
                </p>
              </div>
              <Badge tone={r.tipo === "BUG" ? "danger" : "warning"}>{r.tipo === "BUG" ? "Bug" : "Sugestão"}</Badge>
              <button
                type="button"
                onClick={() => onOpenDetail(r.id)}
                className="inline-flex items-center gap-1 text-xs text-nord-blue-light hover:underline whitespace-nowrap shrink-0"
              >
                <Eye size={13} /> Ver
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-nord-gray text-center py-6">
          Nenhum relato sinalizado como possível duplicata no período selecionado.
        </p>
      )}
    </Section>
  );
}
