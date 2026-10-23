"use client";

import { useEffect, useMemo, useState } from "react";
import { Bug, Lightbulb, BarChart3, History } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { PeriodFilterBar, type PeriodFilterOption } from "@/components/ui/period-filter";
import { resolveRollingPeriod, STANDARD_PERIOD_OPTIONS, type RollingPeriodKey } from "@/lib/periods";
import { formatNumber } from "@/lib/calc";
import { FEEDBACK_STATUS_BY_TIPO, FEEDBACK_STATUS_LABEL, formatHoras, moduloFiltroToParams } from "./labels";
import type { DashboardResponse, ModuloOption, UserOption } from "./types";
import { FeedbackListaTab } from "./feedback-table";
import { FeedbackHistoricoTab } from "./feedback-historico";
import { FeedbackRelatorios } from "./feedback-relatorios";
import { FeedbackDetailModal } from "./feedback-detail-modal";

type TabKey = "bugs" | "sugestoes" | "relatorios" | "historico";

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: "bugs", label: "Bugs", icon: Bug },
  { key: "sugestoes", label: "Sugestões", icon: Lightbulb },
  { key: "relatorios", label: "Relatórios", icon: BarChart3 },
  { key: "historico", label: "Histórico de Atualizações", icon: History },
];

/** "Qualquer período" (default) + os 6 presets padrão do portal — mesma extensão já usada em
 * `avaliacoes-client.tsx` (tela de histórico/auditoria): o padrão certo aqui é mostrar tudo, não
 * só "hoje", já que esta é a central administrativa de TODOS os relatos já recebidos. */
type PeriodoKey = "" | RollingPeriodKey;
const PERIODO_OPTIONS: PeriodFilterOption<PeriodoKey>[] = [
  { key: "", label: "Qualquer período" },
  ...STANDARD_PERIOD_OPTIONS,
];

/**
 * Tela principal da Central de Bugs e Melhorias (painel admin, Fase 3). Orquestra:
 * - a barra de filtros (período, módulo, status, prioridade, usuário — todos no estado deste
 *   componente, repassados como props às abas);
 * - os cards de indicadores (topo), calculados a partir de `GET /api/feedback/dashboard`;
 * - a navegação entre as 4 abas (Bugs / Sugestões / Relatórios / Histórico de Atualizações);
 * - a modal de detalhe de um relato (aberta a partir de qualquer aba, via `openDetailId`).
 *
 * Decisão de design (documentada por pedido explícito da tarefa): `GET /api/feedback/dashboard`
 * só aceita `empresaId`/`from`/`to` como filtro — por isso os cards de indicadores e os gráficos
 * da aba Relatórios respeitam SÓ o filtro de período, nunca módulo/status/prioridade/usuário (os
 * selects de Módulo e Usuário, inclusive, ficam ESCONDIDOS nessa aba — ver condição
 * `activeTab !== "relatorios"` abaixo — pra não sugerir um filtro que não tem efeito nenhum ali).
 * Replicar esses filtros extras client-side exigiria reagregar tudo (médias, contagens por
 * status) na mão a partir de uma listagem paginada, arriscando números ligeiramente diferentes
 * dos agregados oficiais do backend — preferi manter os indicadores sempre fiéis à rota oficial.
 * Já as abas Bugs/Sugestões (listagem) respeitam todos os filtros (módulo, status, prioridade,
 * usuário). A aba Histórico de Atualizações respeita período, módulo e usuário (os três que
 * fazem sentido pra ela e que `GET /api/feedback` aceita via `categoriaId`/`subcategoriaId`/
 * `usuarioCriadorId`) — não tem filtro de status/prioridade próprio porque o status já é fixo
 * (CORRIGIDO/IMPLEMENTADA) e prioridade não é um recorte útil num changelog.
 */
export function BugsMelhoriasClient() {
  const [periodo, setPeriodo] = useState<PeriodoKey>("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [moduloValue, setModuloValue] = useState("");
  const [status, setStatus] = useState("");
  const [prioridade, setPrioridade] = useState("");
  const [usuarioCriadorId, setUsuarioCriadorId] = useState("");

  const [activeTab, setActiveTab] = useState<TabKey>("bugs");

  const [modulos, setModulos] = useState<ModuloOption[]>([]);
  const [usuarios, setUsuarios] = useState<UserOption[]>([]);

  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const [openDetailId, setOpenDetailId] = useState<string | null>(null);
  // Incrementado a cada alteração salva na modal de detalhe (status/prioridade/responsável) —
  // dependência dos `useEffect` de carregamento das abas e do dashboard, pra refletir a mudança
  // sem precisar fechar/reabrir a tela inteira.
  const [refreshToken, setRefreshToken] = useState(0);

  // Reseta o filtro de status ao trocar de aba Bugs <-> Sugestões: os dois tipos têm conjuntos
  // de status diferentes (ver FEEDBACK_STATUS_BY_TIPO) — manter um status de BUG selecionado ao
  // entrar em Sugestões filtraria silenciosamente tudo de fora.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reseta o filtro de status ao trocar de aba (conjuntos de status diferentes por tipo)
    setStatus("");
  }, [activeTab]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/feedback/modulos")
      .then((res) => (res.ok ? res.json() : { modulos: [] }))
      .then((data) => {
        if (!cancelled) setModulos(Array.isArray(data.modulos) ? data.modulos : []);
      })
      .catch(() => {
        if (!cancelled) setModulos([]);
      });
    fetch("/api/usuarios")
      .then((res) => (res.ok ? res.json() : { users: [] }))
      .then((data) => {
        if (cancelled) return;
        const users = Array.isArray(data.users) ? data.users : [];
        setUsuarios(
          users
            .filter((u: { active?: boolean }) => u.active !== false)
            .map((u: { id: string; name: string }) => ({ id: u.id, name: u.name }))
            .sort((a: UserOption, b: UserOption) => a.name.localeCompare(b.name, "pt-BR"))
        );
      })
      .catch(() => {
        if (!cancelled) setUsuarios([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const range = useMemo(() => {
    if (periodo === "") return null;
    if (periodo === "personalizado") {
      if (!customFrom || !customTo) return null;
      return resolveRollingPeriod("personalizado", { from: customFrom, to: customTo });
    }
    return resolveRollingPeriod(periodo);
  }, [periodo, customFrom, customTo]);

  const fromISO = range ? range.from.toISOString() : undefined;
  const toISO = range ? range.to.toISOString() : undefined;
  const moduloParams = useMemo(() => moduloFiltroToParams(moduloValue), [moduloValue]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setDashboardLoading(true);
      setDashboardError(null);
      try {
        const params = new URLSearchParams();
        if (fromISO) params.set("from", fromISO);
        if (toISO) params.set("to", toISO);
        const res = await fetch(`/api/feedback/dashboard?${params.toString()}`);
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setDashboardError(json?.error ?? "Não foi possível carregar os indicadores.");
          return;
        }
        setDashboard(json);
      } catch {
        if (!cancelled) setDashboardError("Falha de conexão. Verifique sua internet e tente novamente.");
      } finally {
        if (!cancelled) setDashboardLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [fromISO, toISO, refreshToken]);

  function applyPeriodo(key: PeriodoKey, from?: string, to?: string) {
    setPeriodo(key);
    if (key === "personalizado") {
      setCustomFrom(from ?? "");
      setCustomTo(to ?? "");
    }
  }

  function countFor(tipo: "BUG" | "SUGESTAO", s: string): number {
    return dashboard?.porStatus.find((row) => row.tipo === tipo && row.status === s)?.count ?? 0;
  }

  const kpiCards = useMemo(() => {
    if (!dashboard) return [];
    const { kpis } = dashboard;
    const tempoResposta = kpis.tempoMedioPrimeiraRespostaHoras;
    const tempoResolucao = kpis.tempoMedioResolucaoHoras;
    return [
      { key: "total-bugs", label: "Total de bugs recebidos", value: formatNumber(kpis.totalBugs), icon: "Bug", color: "#ef4444" },
      { key: "bugs-abertos", label: "Bugs em aberto", value: formatNumber(kpis.bugsAbertos), icon: "AlertCircle", color: "#f59e0b" },
      { key: "bugs-analise", label: "Bugs em análise", value: formatNumber(countFor("BUG", "EM_ANALISE")), icon: "Search", color: "#3b82f6" },
      { key: "bugs-correcao", label: "Bugs em correção", value: formatNumber(countFor("BUG", "EM_CORRECAO")), icon: "Wrench", color: "#3b82f6" },
      { key: "bugs-corrigidos", label: "Bugs corrigidos", value: formatNumber(countFor("BUG", "CORRIGIDO")), icon: "CheckCircle2", color: "#22c55e" },
      { key: "bugs-reabertos", label: "Bugs reabertos", value: formatNumber(countFor("BUG", "REABERTO")), icon: "RotateCcw", color: "#ef4444" },
      { key: "total-sugestoes", label: "Total de sugestões", value: formatNumber(kpis.totalSugestoes), icon: "Lightbulb", color: "#f59e0b" },
      { key: "sugestoes-aprovadas", label: "Sugestões aprovadas", value: formatNumber(countFor("SUGESTAO", "APROVADA")), icon: "ThumbsUp", color: "#22c55e" },
      {
        key: "sugestoes-implementadas",
        label: "Sugestões implementadas",
        value: formatNumber(countFor("SUGESTAO", "IMPLEMENTADA")),
        icon: "Sparkles",
        color: "#22c55e",
      },
      {
        key: "tempo-resposta",
        label: "Tempo médio de 1ª resposta",
        value: tempoResposta != null ? formatHoras(tempoResposta) : "—",
        hint: tempoResposta == null ? "Sem dados suficientes" : undefined,
        icon: "Clock4",
        color: "#3b82f6",
      },
      {
        key: "tempo-resolucao",
        label: "Tempo médio de resolução",
        value: tempoResolucao != null ? formatHoras(tempoResolucao) : "—",
        hint: tempoResolucao == null ? "Sem dados suficientes" : undefined,
        icon: "Timer",
        color: "#3b82f6",
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- countFor fecha sobre `dashboard`, já na lista de dependências
  }, [dashboard]);

  function handleChanged() {
    setRefreshToken((t) => t + 1);
  }

  return (
    <div className="space-y-6">
      <Section title="Filtros">
        <div className="space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-nord-gray mb-1.5">Período</p>
            <PeriodFilterBar
              periodo={periodo}
              onApply={applyPeriodo}
              options={PERIODO_OPTIONS}
              initialCustomFrom={customFrom}
              initialCustomTo={customTo}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Módulo e Usuário não têm efeito nenhum na aba Relatórios (GET /api/feedback/dashboard
                só aceita período/empresa — ver comentário no topo do arquivo) — escondidos aqui pra
                não sugerir um filtro que não filtra nada. */}
            {activeTab !== "relatorios" && (
              <select
                aria-label="Filtrar por módulo"
                value={moduloValue}
                onChange={(e) => setModuloValue(e.target.value)}
                className="input w-56"
              >
                <option value="">Todos os módulos</option>
                {modulos.map((m) =>
                  m.subcategories.length > 0 ? (
                    <optgroup key={m.id} label={m.name}>
                      {m.subcategories.map((s) => (
                        <option key={s.id} value={`sub:${s.id}`}>
                          {s.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : (
                    <option key={m.id} value={`cat:${m.id}`}>
                      {m.name}
                    </option>
                  )
                )}
              </select>
            )}

            {(activeTab === "bugs" || activeTab === "sugestoes") && (
              <>
                <select
                  aria-label="Filtrar por status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="input w-48"
                >
                  <option value="">Todos os status</option>
                  {FEEDBACK_STATUS_BY_TIPO[activeTab === "bugs" ? "BUG" : "SUGESTAO"].map((s) => (
                    <option key={s} value={s}>
                      {FEEDBACK_STATUS_LABEL[s] ?? s}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filtrar por prioridade"
                  value={prioridade}
                  onChange={(e) => setPrioridade(e.target.value)}
                  className="input w-40"
                >
                  <option value="">Todas as prioridades</option>
                  <option value="BAIXA">Baixa</option>
                  <option value="MEDIA">Média</option>
                  <option value="ALTA">Alta</option>
                  <option value="CRITICA">Crítica</option>
                </select>
              </>
            )}

            {activeTab !== "relatorios" && (
              <select
                aria-label="Filtrar por usuário"
                value={usuarioCriadorId}
                onChange={(e) => setUsuarioCriadorId(e.target.value)}
                className="input w-56"
              >
                <option value="">Todos os usuários</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            )}

            {(moduloValue || status || prioridade || usuarioCriadorId || periodo !== "") && (
              <button
                type="button"
                onClick={() => {
                  setModuloValue("");
                  setStatus("");
                  setPrioridade("");
                  setUsuarioCriadorId("");
                  setPeriodo("");
                  setCustomFrom("");
                  setCustomTo("");
                }}
                className="text-xs text-nord-gray hover:text-white underline underline-offset-2"
              >
                Limpar filtros
              </button>
            )}
          </div>
        </div>
      </Section>

      {dashboardError ? (
        <div className="nord-card p-6 text-center text-sm text-nord-danger">{dashboardError}</div>
      ) : dashboardLoading && !dashboard ? (
        <div className="nord-card p-6 text-center text-sm text-nord-gray">Carregando indicadores...</div>
      ) : (
        <SortableStatCards
          storageKey="bugs-melhorias-kpi-order"
          className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4"
          cards={kpiCards}
        />
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === tab.key ? "bg-nord-blue text-white" : "bg-nord-panel text-nord-gray hover:text-white"
              }`}
            >
              <Icon size={13} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "bugs" && (
        <FeedbackListaTab
          tipo="BUG"
          fromISO={fromISO}
          toISO={toISO}
          categoriaId={moduloParams.categoriaId}
          subcategoriaId={moduloParams.subcategoriaId}
          status={status}
          prioridade={prioridade}
          usuarioCriadorId={usuarioCriadorId}
          refreshToken={refreshToken}
          onOpenDetail={setOpenDetailId}
        />
      )}
      {activeTab === "sugestoes" && (
        <FeedbackListaTab
          tipo="SUGESTAO"
          fromISO={fromISO}
          toISO={toISO}
          categoriaId={moduloParams.categoriaId}
          subcategoriaId={moduloParams.subcategoriaId}
          status={status}
          prioridade={prioridade}
          usuarioCriadorId={usuarioCriadorId}
          refreshToken={refreshToken}
          onOpenDetail={setOpenDetailId}
        />
      )}
      {activeTab === "relatorios" && (
        <FeedbackRelatorios
          dashboard={dashboard}
          loading={dashboardLoading}
          fromISO={fromISO}
          toISO={toISO}
          refreshToken={refreshToken}
          onOpenDetail={setOpenDetailId}
        />
      )}
      {activeTab === "historico" && (
        <FeedbackHistoricoTab
          fromISO={fromISO}
          toISO={toISO}
          categoriaId={moduloParams.categoriaId}
          subcategoriaId={moduloParams.subcategoriaId}
          usuarioCriadorId={usuarioCriadorId}
          refreshToken={refreshToken}
          onOpenDetail={setOpenDetailId}
        />
      )}

      <FeedbackDetailModal
        id={openDetailId}
        usuarios={usuarios}
        onClose={() => setOpenDetailId(null)}
        onOpenRelated={(id) => setOpenDetailId(id)}
        onChanged={handleChanged}
      />
    </div>
  );
}
