"use client";

import { useCallback, useEffect, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Section, ProgressBar } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { FormError } from "@/components/ui/modal";
import { StoreSwitcher } from "@/components/sidebar/store-switcher";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/calc";
import { QuickActionMenu } from "./quick-action-menu";
import { DesempenhoChart } from "./desempenho-chart";
import { RotinaPanel } from "./rotina-panel";
import { AlertasPanel } from "./alertas-panel";

type EmpresaDTO = { id: string; key: string; name: string; color: string; logo: string | null };

type PeriodoChave = "hoje" | "7dias" | "mes" | "custom";

const PERIODO_OPTIONS: { key: PeriodoChave; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "7dias", label: "Últimos 7 dias" },
  { key: "mes", label: "Este mês" },
  { key: "custom", label: "Personalizado" },
];

type IndicadorComDelta = { valor: number; variacaoPercent: number | null };
type ProgressoMeta = { percentual: number; faturamentoMes: number; metaMensal: number };

type IndicadoresResponse = {
  faturamento: IndicadorComDelta;
  progressoMeta: ProgressoMeta;
  pedidos: { quantidade: number; variacaoPercent: number | null };
  ticketMedio: IndicadorComDelta;
  checklistsConcluidos: { quantidade: number };
  tarefasPendentes: { quantidade: number };
  equipePresente: { quantidade: number };
  nps: IndicadorComDelta;
};

type DesempenhoResponse = {
  nomeLoja: string;
  faturamento: number;
  progressoMeta: ProgressoMeta;
  pedidos: number;
  ticketMedio: number;
  nps: number;
  variacaoPercent: number | null;
  serieDiaria7Dias: { data: string; faturamento: number }[];
};

/** Verde a partir de 100% da meta, amarelo a partir de 70%, vermelho abaixo disso — mesmo corte já usado na versão anterior da Tela de Início. */
function metaColor(percentual: number): string {
  if (percentual >= 100) return "#22c55e";
  if (percentual >= 70) return "#f59e0b";
  return "#ef4444";
}

/** Mesma faixa de cor usada para NPS/eNPS no restante do Portal (ex.: src/app/portal/crm/satisfacao/satisfacao-client.tsx). */
function npsColor(valor: number): string {
  if (valor >= 50) return "#22c55e";
  if (valor >= 0) return "#f59e0b";
  return "#ef4444";
}

export function GerencialDashboardClient({
  empresaId,
  empresas,
  canViewGrupoNord,
}: {
  empresaId: string;
  empresas: EmpresaDTO[];
  canViewGrupoNord: boolean;
}) {
  const [periodo, setPeriodo] = useState<PeriodoChave>("hoje");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [indicadores, setIndicadores] = useState<IndicadoresResponse | null>(null);
  const [desempenho, setDesempenho] = useState<DesempenhoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (chave: PeriodoChave, from?: string, to?: string) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ empresaId, periodo: chave });
      if (chave === "custom" && from && to) {
        params.set("inicio", from);
        params.set("fim", to);
      }
      try {
        const [resIndicadores, resDesempenho] = await Promise.all([
          fetch(`/api/inicio/indicadores?${params.toString()}`),
          fetch(`/api/inicio/desempenho-loja?${params.toString()}`),
        ]);
        if (!resIndicadores.ok || !resDesempenho.ok) {
          setError("Não foi possível carregar os dados deste painel. Tente novamente em instantes.");
          return;
        }
        setIndicadores(await resIndicadores.json());
        setDesempenho(await resDesempenho.json());
      } catch {
        setError("Não foi possível carregar os dados deste painel. Tente novamente em instantes.");
      } finally {
        setLoading(false);
      }
    },
    [empresaId]
  );

  // Recarrega quando a loja ativa muda (troca no seletor desta mesma tela).
  // Trocas de período têm seus próprios gatilhos (selectPeriod/aplicarPersonalizado).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca os dados da loja ativa ao montar e sempre que ela muda
    load(periodo, periodo === "custom" ? customFrom : undefined, periodo === "custom" ? customTo : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só deve recarregar quando empresaId muda
  }, [empresaId]);

  function selectPeriod(chave: PeriodoChave) {
    setPeriodo(chave);
    if (chave !== "custom") load(chave);
  }

  function aplicarPersonalizado() {
    if (!customFrom || !customTo) return;
    load("custom", customFrom, customTo);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {PERIODO_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => selectPeriod(opt.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                periodo === opt.key ? "bg-nord-blue text-white" : "bg-nord-panel text-nord-gray hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
          {periodo === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="input"
              />
              <span className="text-nord-gray text-xs">até</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="input" />
              <button
                onClick={aplicarPersonalizado}
                disabled={!customFrom || !customTo}
                className="px-3 py-2 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white font-medium"
              >
                Aplicar
              </button>
            </div>
          )}
          {loading && indicadores && <span className="text-xs text-nord-gray animate-pulse">Atualizando...</span>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StoreSwitcher
            compact
            collapsed={false}
            empresas={empresas}
            activeEmpresaId={empresaId}
            canViewGrupoNord={canViewGrupoNord}
          />
          <QuickActionMenu />
        </div>
      </div>

      <FormError message={error} />

      {!indicadores || !desempenho ? (
        <div className="nord-card p-10 text-center text-sm text-nord-gray">
          {error ? "Não foi possível carregar os indicadores." : "Carregando indicadores..."}
        </div>
      ) : (
        <>
          <Section title="Indicadores principais">
            <SortableStatCards
              storageKey="inicio-v2-indicadores-order"
              cards={[
                {
                  key: "faturamento",
                  label: "Faturamento",
                  value: formatCurrency(indicadores.faturamento.valor),
                  icon: "DollarSign",
                  delta: indicadores.faturamento.variacaoPercent,
                  href: "/portal/vendas",
                },
                {
                  key: "progresso-meta",
                  label: "Progresso da meta",
                  value: formatPercent(indicadores.progressoMeta.percentual),
                  icon: "Target",
                  color: metaColor(indicadores.progressoMeta.percentual),
                  hint: `${formatCurrency(indicadores.progressoMeta.faturamentoMes)} de ${formatCurrency(
                    indicadores.progressoMeta.metaMensal
                  )}`,
                  href: "/portal/metas",
                },
                {
                  key: "pedidos",
                  label: "Pedidos",
                  value: formatNumber(indicadores.pedidos.quantidade),
                  icon: "ShoppingBag",
                  delta: indicadores.pedidos.variacaoPercent,
                  href: "/portal/vendas",
                },
                {
                  key: "ticket-medio",
                  label: "Ticket médio",
                  value: formatCurrency(indicadores.ticketMedio.valor),
                  icon: "Receipt",
                  delta: indicadores.ticketMedio.variacaoPercent,
                  href: "/portal/vendas",
                },
                {
                  key: "checklists-concluidos",
                  label: "Checklists concluídos",
                  value: formatNumber(indicadores.checklistsConcluidos.quantidade),
                  icon: "ClipboardCheck",
                  hint: "no período selecionado",
                  href: "/portal/tarefas/checklist",
                },
                {
                  key: "tarefas-pendentes",
                  label: "Tarefas pendentes",
                  value: formatNumber(indicadores.tarefasPendentes.quantidade),
                  icon: "ListTodo",
                  hint: "no momento",
                  href: "/portal/tarefas",
                },
                {
                  key: "equipe-presente",
                  label: "Equipe presente hoje",
                  value: formatNumber(indicadores.equipePresente.quantidade),
                  icon: "Users",
                  hint: "hoje",
                  href: "/portal/rh/ponto-eletronico",
                },
                {
                  key: "nps",
                  label: "NPS",
                  value: formatNumber(indicadores.nps.valor, 1),
                  icon: "Smile",
                  delta: indicadores.nps.variacaoPercent,
                  color: npsColor(indicadores.nps.valor),
                  href: "/portal/crm/satisfacao",
                },
              ]}
            />
          </Section>

          <Section title={`Desempenho da loja — ${desempenho.nomeLoja}`}>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="space-y-4">
                <div>
                  <p className="text-nord-gray text-xs mb-1">Faturamento no período</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white text-2xl font-semibold tracking-tight">
                      {formatCurrency(desempenho.faturamento)}
                    </span>
                    {desempenho.variacaoPercent !== null && (
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium ${
                          desempenho.variacaoPercent >= 0
                            ? "bg-nord-success/15 text-nord-success"
                            : "bg-nord-danger/15 text-nord-danger"
                        }`}
                      >
                        {desempenho.variacaoPercent >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {desempenho.variacaoPercent >= 0 ? "+" : ""}
                        {desempenho.variacaoPercent.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs text-nord-gray mb-1">
                    <span>Meta do mês</span>
                    <span>{formatPercent(desempenho.progressoMeta.percentual)}</span>
                  </div>
                  <ProgressBar
                    percent={desempenho.progressoMeta.percentual}
                    color={metaColor(desempenho.progressoMeta.percentual)}
                  />
                  <p className="text-[11px] text-nord-gray mt-1">
                    {formatCurrency(desempenho.progressoMeta.faturamentoMes)} de{" "}
                    {formatCurrency(desempenho.progressoMeta.metaMensal)}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-3 border-t border-nord-border">
                  <div>
                    <p className="text-nord-gray text-[11px]">Pedidos</p>
                    <p className="text-white text-sm font-medium">{formatNumber(desempenho.pedidos)}</p>
                  </div>
                  <div>
                    <p className="text-nord-gray text-[11px]">Ticket médio</p>
                    <p className="text-white text-sm font-medium">{formatCurrency(desempenho.ticketMedio)}</p>
                  </div>
                  <div>
                    <p className="text-nord-gray text-[11px]">NPS</p>
                    <p className="text-white text-sm font-medium">{formatNumber(desempenho.nps, 1)}</p>
                  </div>
                </div>
              </div>

              <div className="xl:col-span-2">
                <p className="text-xs text-nord-gray mb-2">Faturamento diário — últimos 7 dias</p>
                <DesempenhoChart serie={desempenho.serieDiaria7Dias} />
              </div>
            </div>
          </Section>
        </>
      )}

      {/*
        Rotina e alertas não dependem do período selecionado acima (as duas
        rotas são sempre "agora"), então cada painel busca os próprios dados
        de forma independente — inclusive antes dos indicadores terminarem de
        carregar — e só refaz a busca quando a loja ativa (empresaId) muda.
      */}
      <RotinaPanel empresaId={empresaId} />
      <AlertasPanel empresaId={empresaId} />
    </div>
  );
}
