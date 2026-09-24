"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
  LabelList,
} from "recharts";
import { Section, ProgressBar } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { makeBarValueLabel } from "@/components/ui/bar-value-label";
import { formatNumber, formatPercent } from "@/lib/calc";
import { CRM_PERIOD_OPTIONS, type CrmPeriodKey } from "@/lib/crm";

type DashboardKpis = {
  notaMedia: number;
  totalAvaliacoes: number;
  positivasCount: number;
  positivasPercent: number;
  criticasCount: number;
  criticasPercent: number;
  clientesUnicos: number;
  premiosGanhos: number;
};
type EvolucaoPonto = { data: string; notaMedia: number; total: number };
type AreaSatisfacao = { tema: string; mediaPercent: number; total: number; abaixoDaMeta: boolean };
type MotivoNegativo = { motivoTagId: string; nome: string; total: number };
type DashboardResponse = {
  kpis: DashboardKpis;
  evolucao: EvolucaoPonto[];
  satisfacaoPorArea: AreaSatisfacao[];
  motivosNegativos: MotivoNegativo[];
};

type Granularidade = "dia" | "semana" | "mes";

const GRANULARIDADE_OPTIONS: { key: Granularidade; label: string }[] = [
  { key: "dia", label: "Diário" },
  { key: "semana", label: "Semanal" },
  { key: "mes", label: "Mensal" },
];

/** Mesmo corte visual do "NPS" na Tela de Início (ver `npsColor`, gerencial-dashboard-client.tsx),
 *  adaptado pra escala 0-10: só um indicador de relance no card, não substitui a meta configurável
 *  por loja (`CustomerSurveyConfig.notaPositivaAPartirDe`), que já é o que decide "positiva"/
 *  "crítica" nos números de verdade (KPIs, filtro topo). */
function notaColor(valor: number): string {
  if (valor >= 8) return "#22c55e";
  if (valor >= 6) return "#f59e0b";
  return "#ef4444";
}

/** "tempo_espera" -> "Tempo espera" — tema é texto livre digitado na Ficha da pergunta (ver
 *  `CustomerSurveyQuestion.tema` no schema), não um enum com label fixo. */
function formatTema(tema: string): string {
  const semUnderscore = tema.replace(/_/g, " ").trim();
  return semUnderscore.charAt(0).toUpperCase() + semUnderscore.slice(1);
}

function formatEvolucaoTick(value: string, granularidade: Granularidade): string {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  if (granularidade === "mes") return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function VisaoGeralClient() {
  const [key, setKey] = useState<CrmPeriodKey>("mes");
  const [granularidade, setGranularidade] = useState<Granularidade>("dia");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [appliedCustom, setAppliedCustom] = useState<{ from: string; to: string } | null>(null);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadPeriod(periodKey: CrmPeriodKey, gran: Granularidade, from?: string, to?: string) {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ key: periodKey, granularidade: gran });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/satisfacao-cliente/dashboard?${params.toString()}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setLoadError(json?.error ?? "Não foi possível carregar o dashboard de Satisfação do Cliente.");
        return;
      }
      setData(json);
    } catch {
      setLoadError("Falha de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carrega o dashboard no mount
    loadPeriod(key, granularidade);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectPeriod(newKey: CrmPeriodKey) {
    setKey(newKey);
    if (newKey === "personalizado") return; // aguarda "Aplicar" (precisa de from/to antes de buscar)
    setAppliedCustom(null);
    loadPeriod(newKey, granularidade);
  }

  function applyCustomPeriod() {
    if (!customFrom || !customTo) return;
    setAppliedCustom({ from: customFrom, to: customTo });
    loadPeriod("personalizado", granularidade, customFrom, customTo);
  }

  function selectGranularidade(g: Granularidade) {
    setGranularidade(g);
    loadPeriod(key, g, appliedCustom?.from, appliedCustom?.to);
  }

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
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-sm text-white"
          />
          <span className="text-nord-gray text-xs">até</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-sm text-white"
          />
          <button
            onClick={applyCustomPeriod}
            disabled={!customFrom || !customTo}
            className="px-3 py-2 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white font-medium"
          >
            Aplicar
          </button>
        </div>
      )}

      {loading && !data ? (
        <div className="nord-card p-8 text-center text-sm text-nord-gray">Carregando...</div>
      ) : loadError ? (
        <div className="nord-card p-8 text-center text-sm text-nord-danger">{loadError}</div>
      ) : (
        data && (
          <>
            <SortableStatCards
              storageKey="satisfacao-cliente-visao-geral-kpi-order"
              className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4"
              cards={[
                {
                  key: "nota-media",
                  label: "Nota média",
                  value: formatNumber(data.kpis.notaMedia, 1),
                  icon: "Star",
                  color: notaColor(data.kpis.notaMedia),
                },
                {
                  key: "total-avaliacoes",
                  label: "Total de avaliações",
                  value: formatNumber(data.kpis.totalAvaliacoes),
                  icon: "MessageSquare",
                },
                {
                  key: "positivas",
                  label: "Positivas",
                  value: formatPercent(data.kpis.positivasPercent),
                  icon: "ThumbsUp",
                  color: "#22c55e",
                  hint: `${formatNumber(data.kpis.positivasCount)} avaliações`,
                },
                {
                  key: "criticas",
                  label: "Críticas",
                  value: formatNumber(data.kpis.criticasCount),
                  icon: "AlertTriangle",
                  color: "#ef4444",
                  hint: `${formatPercent(data.kpis.criticasPercent)} do total`,
                },
                {
                  key: "clientes-unicos",
                  label: "Clientes únicos",
                  value: formatNumber(data.kpis.clientesUnicos),
                  icon: "Users",
                },
                {
                  key: "premios-ganhos",
                  label: "Prêmios ganhos",
                  value: formatNumber(data.kpis.premiosGanhos),
                  icon: "Gift",
                  hint: "Roleta de Prêmios",
                },
              ]}
            />

            <Section
              title="Evolução da nota geral"
              action={
                <div className="flex items-center gap-1 bg-nord-panel rounded-lg p-1">
                  {GRANULARIDADE_OPTIONS.map((g) => (
                    <button
                      key={g.key}
                      onClick={() => selectGranularidade(g.key)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                        granularidade === g.key ? "bg-nord-blue text-white" : "text-nord-gray hover:text-white"
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              }
            >
              {data.evolucao.length === 0 ? (
                <p className="text-sm text-nord-gray text-center py-10">Nenhuma avaliação no período selecionado.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={data.evolucao}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
                    <XAxis
                      dataKey="data"
                      tickFormatter={(v) => formatEvolucaoTick(v, granularidade)}
                      stroke="#9a9aa2"
                      fontSize={11}
                    />
                    <YAxis stroke="#9a9aa2" fontSize={11} domain={[0, 10]} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }}
                      labelFormatter={(v) => formatEvolucaoTick(String(v), granularidade)}
                      formatter={(value, _name, ctx) => [
                        `${formatNumber(Number(value), 1)} (${(ctx.payload as EvolucaoPonto).total} avaliações)`,
                        "Nota média",
                      ]}
                    />
                    <Line type="monotone" dataKey="notaMedia" name="Nota média" stroke="#1464F4" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Section>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Section title="Satisfação por área">
                {data.satisfacaoPorArea.length === 0 ? (
                  <p className="text-sm text-nord-gray text-center py-6">
                    Nenhuma resposta com área classificada no período selecionado.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {data.satisfacaoPorArea.map((area) => {
                      const semDados = area.total === 0;
                      const barColor = semDados ? "#232a37" : area.abaixoDaMeta ? "#ef4444" : "#22c55e";
                      return (
                        <div key={area.tema}>
                          <div className="flex items-center justify-between text-xs mb-1.5 gap-2">
                            <span className="text-white font-medium truncate">{formatTema(area.tema)}</span>
                            {semDados ? (
                              <span className="text-nord-gray shrink-0">Sem dados</span>
                            ) : (
                              <span className={`font-medium shrink-0 ${area.abaixoDaMeta ? "text-nord-danger" : "text-nord-success"}`}>
                                {formatPercent(area.mediaPercent, 0)}
                                {area.abaixoDaMeta ? " · abaixo da meta" : ""}
                              </span>
                            )}
                          </div>
                          <ProgressBar percent={semDados ? 0 : area.mediaPercent} color={barColor} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>

              <Section title="Motivos de avaliações negativas">
                {data.motivosNegativos.length === 0 ? (
                  <p className="text-sm text-nord-gray text-center py-6">
                    Nenhum motivo registrado ainda. Eles aparecem aqui conforme avaliações críticas forem resolvidas
                    com um motivo selecionado.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(180, data.motivosNegativos.length * 36)}>
                    <BarChart data={data.motivosNegativos} layout="vertical" margin={{ left: 24, right: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" horizontal={false} />
                      <XAxis type="number" stroke="#9a9aa2" fontSize={11} allowDecimals={false} />
                      <YAxis type="category" dataKey="nome" stroke="#9a9aa2" fontSize={11} width={140} />
                      <Tooltip contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }} />
                      <Bar dataKey="total" fill="#ef4444" radius={[0, 6, 6, 0]}>
                        <LabelList dataKey="total" content={makeBarValueLabel(formatNumber)} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Section>
            </div>

            <div className="flex justify-end">
              <Link href="/portal/satisfacao-cliente/avaliacoes" className="text-xs text-nord-blue-light hover:underline">
                Ver todas as avaliações →
              </Link>
            </div>
          </>
        )
      )}
    </div>
  );
}
