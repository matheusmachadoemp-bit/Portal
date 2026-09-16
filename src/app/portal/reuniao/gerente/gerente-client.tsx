"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, FileDown, Plus, Trash2 } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog, FormError } from "@/components/ui/modal";
import { DynamicIcon } from "@/components/dynamic-icon";
import { IconPicker } from "@/components/ui/icon-picker";
import { statusOf } from "@/components/reuniao/indicator-card";
import { CompareMonthsPicker } from "@/components/reuniao/compare-months";
import { indicatorAccentColor } from "@/components/reuniao/fechamento-do-mes";
import { useMetasProximoMes, MetasProximoMesSection, fetchMetasProximoMesForPdf } from "@/components/reuniao/metas-proximo-mes";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { periodoLabel, periodoShortLabel, resolveComparePeriodos } from "@/lib/reuniao";
import type { GerenteCustomIndicatorDTO } from "@/lib/reuniao-server";

type Meeting = {
  id: string;
  periodo: string;
  faturamentoTotalValor: number | null;
  cmvPercent: number | null;
  npsPercent: number | null;
  cancelamentoDeliveryPercent: number | null;
  // `turnoverPercent`/`faltasAtrasosAtestados`/`checklistOperacionalPercent` seguem existindo na
  // coluna do banco — o modal "Fechamento do mês" deixou de ter campo pra editá-los (seção
  // "Resultado do período" removida), mas o tipo continua com os 3 porque `buildForm` precisa
  // deles pra fazer round-trip no `submit()` (ver comentário lá: sem isso, salvar qualquer outra
  // coisa no modal apagaria retroativamente valores já lançados em meses anteriores, já que a
  // rota `POST /api/reuniao/gerente` trata campo ausente no body como "grava null").
  turnoverPercent: number | null;
  faltasAtrasosAtestados: number | null;
  checklistOperacionalPercent: number | null;
  notas: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { name: string };
};

type Metrics = {
  faturamentoTotalValor: number | null;
  cmvPercent: number | null;
  npsPercent: number | null;
  cancelamentoDeliveryPercent: number | null;
};

function formToPayload(periodo: string, form: ReturnType<typeof buildForm>) {
  return { periodo, ...form };
}

function buildForm(m?: Meeting | null) {
  // Turnover (%), Faltas/Atrasos/Atestados e Checklist Operacional (%) não têm mais input no
  // modal (seção "Resultado do período" removida), mas continuam aqui "congelados" com o valor
  // já salvo — mesmo padrão usado pro campo `valor` dos indicadores customizados (ver
  // `buildCustomForm`/`CustomForm` abaixo). É só pra fazer round-trip no payload do `submit()`:
  // como a rota POST grava `null` em qualquer campo que não vier no body, se essas 3 chaves
  // simplesmente não existissem no form, qualquer "Salvar" (ex.: só criando um indicador
  // customizado, sem tocar nesses 3) apagaria retroativamente um valor já lançado em um mês
  // anterior. Congelado = nunca mudam pela UI, mas sempre voltam pro servidor do jeito que já
  // estavam.
  return {
    turnoverPercent: m?.turnoverPercent != null ? String(m.turnoverPercent) : "",
    faltasAtrasosAtestados: m?.faltasAtrasosAtestados != null ? String(m.faltasAtrasosAtestados) : "",
    checklistOperacionalPercent: m?.checklistOperacionalPercent != null ? String(m.checklistOperacionalPercent) : "",
    notas: m?.notas ?? "",
  };
}

// `valor` era escrito por um input duplicado na antiga seção "Resultado do período" (removida
// a pedido do usuário) e nunca é lido/exibido em nenhum outro lugar do app — quem alimenta a
// tela é sempre `valorReferencia`, usado no card "Fechamento do mês" (dentro e fora do modal).
// Mantido aqui só porque divide a mesma estrutura de estado que `valorReferencia`; sem input
// escrevendo nele, fica congelado no valor carregado da API (comportamento aceito pelo usuário).
// `valorSecundario`: 2º valor de um indicador "composto" (ex.: Cancelamentos = % + quantidade)
// — só tem input de verdade quando o indicador tem `unidadeSecundaria` configurada; para os
// demais fica sempre "" e nunca é enviado de fato (ver upsertReuniaoCustomIndicatorValues em
// src/lib/reuniao-server.ts, que ignora esse campo quando o indicador não é composto).
type CustomForm = Record<string, { valor: string; valorReferencia: string; valorSecundario: string }>;

function buildCustomForm(indicators: GerenteCustomIndicatorDTO[]): CustomForm {
  return Object.fromEntries(
    indicators.map((ind) => [
      ind.id,
      {
        valor: ind.valor != null ? String(ind.valor) : "",
        valorReferencia: String(ind.valorReferencia),
        valorSecundario: ind.valorSecundario != null ? String(ind.valorSecundario) : "",
      },
    ])
  );
}

const UNIDADE_LABEL: Record<GerenteCustomIndicatorDTO["unidade"], string> = {
  PERCENT: "Percentual (%)",
  CURRENCY: "Reais (R$)",
  NUMBER: "Número",
};

function formatCustomValue(unidade: GerenteCustomIndicatorDTO["unidade"], value: number) {
  if (unidade === "CURRENCY") return formatCurrency(value);
  if (unidade === "PERCENT") return `${formatNumber(value, 1)}%`;
  return formatNumber(value, value % 1 === 0 ? 0 : 1);
}

/** "(%)"/"(R$)"/"" — sufixo mostrado ao lado do rótulo "Valor" nos formulários,
 * conforme a unidade escolhida. */
function unidadeSuffix(unidade: GerenteCustomIndicatorDTO["unidade"]) {
  return unidade === "PERCENT" ? "(%)" : unidade === "CURRENCY" ? "(R$)" : "";
}

/** Estado do formulário de criar/editar indicador — `hasSecondary` marca se este
 * indicador tem um 2º valor por período (ex.: Cancelamentos = % + quantidade);
 * `nomeSecundario`/`unidadeSecundaria` só importam quando `hasSecondary` está
 * marcado (ver `buildSecondaryPayload` abaixo). */
type IndicatorFormState = {
  nome: string;
  unidade: GerenteCustomIndicatorDTO["unidade"];
  icon: string;
  valorPadrao: string;
  hasSecondary: boolean;
  nomeSecundario: string;
  unidadeSecundaria: GerenteCustomIndicatorDTO["unidade"];
};

function emptyIndicatorForm(): IndicatorFormState {
  return { nome: "", unidade: "PERCENT", icon: "Target", valorPadrao: "", hasSecondary: false, nomeSecundario: "", unidadeSecundaria: "PERCENT" };
}

/** Monta os campos `nomeSecundario`/`unidadeSecundaria` do body de criar/editar a
 * partir do formulário — sempre os 2 juntos (ver `parseSecondaryIndicatorFields`
 * em src/lib/reuniao-server.ts): preenchidos quando `hasSecondary` está marcado, ou
 * "" nos 2 quando não está (indicador simples, ou removendo um 2º valor existente). */
function buildSecondaryPayload(form: IndicatorFormState) {
  return {
    nomeSecundario: form.hasSecondary ? form.nomeSecundario : "",
    unidadeSecundaria: form.hasSecondary ? form.unidadeSecundaria : "",
  };
}

export function GerenteClient({
  initialMeetings,
  initialCurrent,
  initialMetrics,
  initialCustomIndicators,
  periodo,
  canCreate,
  canDeleteMetas,
  empresaName,
}: {
  initialMeetings: Meeting[];
  initialCurrent: Meeting | null;
  initialMetrics: Metrics;
  initialCustomIndicators: GerenteCustomIndicatorDTO[];
  periodo: string;
  canCreate: boolean;
  /** Perfil "gerente" tem canCreate/canEdit mas não canDelete no módulo "reuniao" — controla
   * só o botão de excluir meta (criar/editar segue o mesmo `canCreate` do resto da tela). */
  canDeleteMetas: boolean;
  empresaName: string;
}) {
  const [meetings, setMeetings] = useState(initialMeetings);
  const [selectedPeriodo, setSelectedPeriodo] = useState(periodo);
  const [current, setCurrent] = useState(initialCurrent);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [form, setForm] = useState(buildForm(initialCurrent));
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fechamentoModalOpen, setFechamentoModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [comparePeriodos, setComparePeriodos] = useState<[string, string, string]>(["", "", ""]);

  const [customIndicators, setCustomIndicators] = useState(initialCustomIndicators);
  const [customForm, setCustomForm] = useState(buildCustomForm(initialCustomIndicators));
  const [newIndicatorOpen, setNewIndicatorOpen] = useState(false);
  const [newIndicatorForm, setNewIndicatorForm] = useState<IndicatorFormState>(emptyIndicatorForm());
  const [creatingIndicator, setCreatingIndicator] = useState(false);
  const [newIndicatorError, setNewIndicatorError] = useState<string | null>(null);
  const [deleteIndicatorTarget, setDeleteIndicatorTarget] = useState<GerenteCustomIndicatorDTO | null>(null);
  const [deletingIndicator, setDeletingIndicator] = useState(false);
  const [editIndicatorTarget, setEditIndicatorTarget] = useState<GerenteCustomIndicatorDTO | null>(null);
  const [editIndicatorForm, setEditIndicatorForm] = useState<IndicatorFormState>(emptyIndicatorForm());
  const [savingEditIndicator, setSavingEditIndicator] = useState(false);
  const [editIndicatorError, setEditIndicatorError] = useState<string | null>(null);

  const mp = useMetasProximoMes("/api/reuniao/gerente", canCreate);

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/reuniao/gerente?periodo=${selectedPeriodo}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setCurrent(data.current);
        setMetrics(data.metrics);
        setForm(buildForm(data.current));
        setCustomIndicators(data.customIndicators ?? []);
        setCustomForm(buildCustomForm(data.customIndicators ?? []));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedPeriodo]);

  // `form.turnoverPercent`/`form.checklistOperacionalPercent` não têm mais input (congelados,
  // ver `buildForm`), mas continuam refletindo o valor já salvo — dá pra seguir usando como fonte
  // do comparativo do PDF sem mudança de comportamento.
  const turnoverValor = form.turnoverPercent ? Number(form.turnoverPercent) : null;
  const checklistValor = form.checklistOperacionalPercent ? Number(form.checklistOperacionalPercent) : null;

  function customIndicatorState(ind: GerenteCustomIndicatorDTO) {
    const entry = customForm[ind.id] ?? { valor: "", valorReferencia: String(ind.valorPadrao), valorSecundario: "" };
    const valor = entry.valor !== "" ? Number(entry.valor) : null;
    const valorReferencia = Number(entry.valorReferencia) || 0;
    const valorSecundario = entry.valorSecundario !== "" ? Number(entry.valorSecundario) : null;
    return { entry, valor, valorReferencia, valorSecundario };
  }

  function updateCustomForm(id: string, patch: Partial<CustomForm[string]>) {
    setCustomForm((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function exportPdf() {
    const { exportMeetingReportPdf } = await import("@/lib/reuniao-pdf");
    const periodosComparados = resolveComparePeriodos(selectedPeriodo, comparePeriodos);

    // Busca as metas do próximo mês na hora de exportar (não reaproveita o estado `mp.metas`
    // já carregado na tela) pra garantir que o PDF sai com o que está salvo agora — inclusive
    // em modo Grupo Nord, onde a API já devolve lista vazia e o PDF mostra a mensagem de
    // "nenhuma meta cadastrada" em vez de pular a página.
    const metasData = await fetchMetasProximoMesForPdf("/api/reuniao/gerente");

    function historico<K extends "faturamentoTotalValor" | "cmvPercent" | "turnoverPercent" | "checklistOperacionalPercent">(
      key: K,
      atualValue: number | null
    ) {
      return periodosComparados.map((p) => {
        if (p === selectedPeriodo) return { monthLabel: periodoShortLabel(p), value: atualValue };
        const m = meetings.find((mm) => mm.periodo === p);
        return { monthLabel: periodoShortLabel(p), value: m ? m[key] : null };
      });
    }

    // Os 4 indicadores fixos deixaram de ter meta/premiação (viraram entradas
    // de referência livres na lista de "Fechamento do mês") — por enquanto o
    // PDF só mostra o histórico do valor real de cada um, sem linha de meta
    // nem premiação (o relatório em si ainda precisa de um redesenho, já que
    // foi todo pensado em cima do conceito de "bateu a meta").
    exportMeetingReportPdf({
      fileSlug: "reuniao-gerente",
      empresaName,
      periodoLabel: periodoLabel(selectedPeriodo),
      premiacaoTotal: 0,
      observacoes: form.notas,
      indicators: [
        {
          key: "faturamento",
          label: "Faturamento Total",
          unit: "currency",
          meta: 0,
          metaDirection: "max",
          status: statusOf(null),
          premio: 0,
          historico: historico("faturamentoTotalValor", metrics.faturamentoTotalValor),
        },
        {
          key: "cmv",
          label: "CMV",
          unit: "percent",
          meta: 0,
          metaDirection: "min",
          status: statusOf(null),
          premio: 0,
          historico: historico("cmvPercent", metrics.cmvPercent),
        },
        {
          key: "turnover",
          label: "Turnover",
          unit: "percent",
          meta: 0,
          metaDirection: "min",
          status: statusOf(null),
          premio: 0,
          historico: historico("turnoverPercent", turnoverValor),
        },
        {
          key: "checklist",
          label: "Checklist Operacional",
          unit: "percent",
          meta: 0,
          metaDirection: "max",
          status: statusOf(null),
          premio: 0,
          historico: historico("checklistOperacionalPercent", checklistValor),
        },
      ],
      metasProximoMes: {
        periodoLabel: metasData.periodoLabel,
        metas: metasData.metas.map((m) => ({
          metrica: m.metrica,
          valorAlvo: m.valorAlvo,
          valorPremio: m.valorPremio,
          destinatario: m.destinatario,
        })),
      },
    });
  }

  async function refresh(targetPeriodo: string) {
    const res = await fetch(`/api/reuniao/gerente?periodo=${targetPeriodo}`);
    const data = await res.json();
    setMeetings(data.meetings);
    setCurrent(data.current);
    setMetrics(data.metrics);
    setCustomIndicators(data.customIndicators ?? []);
    setCustomForm(buildCustomForm(data.customIndicators ?? []));
  }

  async function submit() {
    if (saving) return;
    setSaving(true);
    try {
      await fetch("/api/reuniao/gerente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formToPayload(selectedPeriodo, form),
          customIndicators: customIndicators.map((ind) => ({ id: ind.id, ...customForm[ind.id] })),
        }),
      });
      await refresh(selectedPeriodo);
    } finally {
      setSaving(false);
    }
  }

  async function createIndicator() {
    if (creatingIndicator) return;
    setNewIndicatorError(null);
    if (!newIndicatorForm.nome.trim()) {
      setNewIndicatorError("Informe um nome para o indicador.");
      return;
    }
    if (newIndicatorForm.hasSecondary && !newIndicatorForm.nomeSecundario.trim()) {
      setNewIndicatorError("Informe o nome do segundo valor (ou desmarque a opção de segundo valor).");
      return;
    }
    setCreatingIndicator(true);
    try {
      const res = await fetch("/api/reuniao/gerente/indicadores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: newIndicatorForm.nome,
          unidade: newIndicatorForm.unidade,
          icon: newIndicatorForm.icon,
          valorPadrao: newIndicatorForm.valorPadrao,
          ...buildSecondaryPayload(newIndicatorForm),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setNewIndicatorError(data?.error ?? "Não foi possível criar o indicador.");
        return;
      }
      setNewIndicatorOpen(false);
      setNewIndicatorForm(emptyIndicatorForm());
      await refresh(selectedPeriodo);
    } finally {
      setCreatingIndicator(false);
    }
  }

  function openEditIndicator(ind: GerenteCustomIndicatorDTO) {
    setEditIndicatorTarget(ind);
    setEditIndicatorForm({
      nome: ind.nome,
      unidade: ind.unidade,
      icon: ind.icon,
      valorPadrao: String(ind.valorPadrao),
      hasSecondary: !!ind.unidadeSecundaria,
      nomeSecundario: ind.nomeSecundario ?? "",
      unidadeSecundaria: ind.unidadeSecundaria ?? "PERCENT",
    });
    setEditIndicatorError(null);
  }

  async function saveEditIndicator() {
    if (!editIndicatorTarget || savingEditIndicator) return;
    setEditIndicatorError(null);
    if (!editIndicatorForm.nome.trim()) {
      setEditIndicatorError("Informe um nome para o indicador.");
      return;
    }
    if (editIndicatorForm.hasSecondary && !editIndicatorForm.nomeSecundario.trim()) {
      setEditIndicatorError("Informe o nome do segundo valor (ou desmarque a opção de segundo valor).");
      return;
    }
    setSavingEditIndicator(true);
    try {
      const res = await fetch(`/api/reuniao/gerente/indicadores/${editIndicatorTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: editIndicatorForm.nome,
          unidade: editIndicatorForm.unidade,
          icon: editIndicatorForm.icon,
          valorPadrao: editIndicatorForm.valorPadrao,
          ...buildSecondaryPayload(editIndicatorForm),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setEditIndicatorError(data?.error ?? "Não foi possível salvar as alterações do indicador.");
        return;
      }
      setEditIndicatorTarget(null);
      await refresh(selectedPeriodo);
    } finally {
      setSavingEditIndicator(false);
    }
  }

  async function confirmDeleteIndicator() {
    if (!deleteIndicatorTarget || deletingIndicator) return;
    setDeletingIndicator(true);
    try {
      await fetch(`/api/reuniao/gerente/indicadores/${deleteIndicatorTarget.id}`, { method: "DELETE" });
      setDeleteIndicatorTarget(null);
      await refresh(selectedPeriodo);
    } finally {
      setDeletingIndicator(false);
    }
  }

  async function doDelete() {
    if (deleting || !current) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/reuniao/gerente?periodo=${current.periodo}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error || "Não foi possível excluir esta reunião.");
        return;
      }
      setConfirmDelete(false);
      setCurrent(null);
      setForm(buildForm(null));
      await refresh(selectedPeriodo);
    } finally {
      setDeleting(false);
    }
  }

  function editHistoryRow(m: Meeting) {
    setSelectedPeriodo(m.periodo);
    setCurrent(m);
    setForm(buildForm(m));
    setMetrics({
      faturamentoTotalValor: m.faturamentoTotalValor,
      cmvPercent: m.cmvPercent,
      npsPercent: m.npsPercent,
      cancelamentoDeliveryPercent: m.cancelamentoDeliveryPercent,
    });
    setFechamentoModalOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={selectedPeriodo}
            onChange={(e) => setSelectedPeriodo(e.target.value)}
            className="input w-auto"
          />
          <h3 className="text-white font-medium capitalize">{periodoLabel(selectedPeriodo)}</h3>
          {loading && <span className="text-xs text-nord-gray">Carregando...</span>}
        </div>
        <div className="flex items-center gap-4">
          <CompareMonthsPicker periodos={comparePeriodos} onChange={setComparePeriodos} />
          <button
            onClick={exportPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-nord-border text-nord-gray hover:text-white hover:border-nord-blue-light"
          >
            <FileDown size={13} /> Exportar PDF
          </button>
          {canCreate && (
            <button onClick={() => setFechamentoModalOpen(true)} className="text-xs text-nord-blue-light hover:underline">
              Editar fechamento do mês
            </button>
          )}
        </div>
      </div>

      {/* Sem loja específica selecionada (visão consolidada "Grupo Nord"), a reunião não
          tem o que mostrar aqui: "Fechamento do mês"/"Observações" são por loja (`canCreate`
          reflete isso — vem de `isSingle` em page.tsx) e o grid de indicadores fixos que
          ficava nesse espaço foi removido (deixou de existir desde que "Fechamento do mês"
          passou a ser a única fonte desses números, sem duplicar o que já aparece nela). Mesmo
          padrão de aviso já usado em outras telas com essa mesma limitação — ver
          src/app/portal/tarefas/checklist/checklist-client.tsx e
          src/app/portal/marketing/trafego-pago/trafego-pago-client.tsx — reaproveitado aqui
          em vez de inventar um texto novo. */}
      {!canCreate && (
        <p className="text-xs text-nord-warning bg-nord-warning/10 border border-nord-warning/30 rounded-lg px-3 py-2">
          Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para ver e
          editar o fechamento do mês desta reunião.
        </p>
      )}

      {/* "Fechamento do mês" (antiga "Metas e premiação"): lista única de indicadores —
          nome + 1 valor de referência por mês, sem meta-alvo nem premiação. Inclui tanto
          os 4 indicadores migrados de GerenteMeeting (Faturamento Total, CMV, Turnover,
          Checklist Operacional) quanto os criados livremente (ex.: Ticket Médio Salão/
          Delivery) — todos tratados exatamente igual, sem distinção nenhuma entre eles.
          Fica visível direto na tela (não só dentro do modal de edição) porque a ideia é
          servir de referência rápida durante a própria reunião. */}
      {canCreate && (
        <Section
          title="Fechamento do mês"
          action={
            <button
              onClick={() => setFechamentoModalOpen(true)}
              className="flex items-center gap-1 text-xs text-nord-blue-light hover:underline"
            >
              <Pencil size={12} /> Editar
            </button>
          }
        >
          {customIndicators.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {customIndicators.map((ind, index) => {
                const { valorReferencia, valorSecundario } = customIndicatorState(ind);
                const color = indicatorAccentColor(index);
                return (
                  <div
                    key={ind.id}
                    className="flex items-center gap-2.5 rounded-lg border border-nord-border/60 px-3 py-2.5 min-w-0"
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${color}22` }}
                    >
                      <DynamicIcon name={ind.icon} size={15} style={{ color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm truncate">
                        <span className="text-nord-gray">{ind.nome}:</span>{" "}
                        <span className="text-white font-semibold">{formatCustomValue(ind.unidade, valorReferencia)}</span>
                      </p>
                      {/* Segundo valor (indicador "composto", ex.: Cancelamentos = % + quantidade) —
                          só aparece quando o indicador tem unidadeSecundaria configurada. */}
                      {ind.unidadeSecundaria && (
                        <p className="text-xs text-nord-gray truncate">
                          {ind.nomeSecundario}:{" "}
                          <span className="text-white font-medium">
                            {formatCustomValue(ind.unidadeSecundaria, valorSecundario ?? 0)}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-nord-gray">
              Nenhum indicador cadastrado ainda. Clique em Editar para adicionar o primeiro (ex.: CMV, Ticket Médio, Turnover...).
            </p>
          )}
        </Section>
      )}

      {canCreate && (
        <Modal
          open={fechamentoModalOpen}
          onClose={() => setFechamentoModalOpen(false)}
          title={`Fechamento do mês — ${periodoLabel(selectedPeriodo)}`}
          widthClass="max-w-2xl"
        >
          <div className="space-y-5">
            <div>
              {/* Lista única de indicadores — nome + 1 valor de referência por mês, sem
                  meta-alvo nem premiação. Inclui tanto os 4 indicadores migrados de
                  GerenteMeeting (Faturamento Total, CMV, Turnover, Checklist Operacional)
                  quanto os criados livremente (ex.: Ticket Médio Salão/Delivery) — sem
                  distinção nenhuma entre eles aqui. */}
              <p className="text-xs text-nord-gray mb-2 font-medium">Fechamento do mês</p>
              {customIndicators.length > 0 ? (
                <div className="space-y-3">
                  {customIndicators.map((ind, index) => {
                    const entry = customForm[ind.id] ?? { valor: "", valorReferencia: String(ind.valorPadrao), valorSecundario: "" };
                    const color = indicatorAccentColor(index);
                    return (
                      <div key={ind.id} className="rounded-lg border border-nord-border/60 p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                              style={{ backgroundColor: `${color}22` }}
                            >
                              <DynamicIcon name={ind.icon} size={14} style={{ color }} />
                            </div>
                            <span className="text-sm text-white font-medium truncate">{ind.nome}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <button
                              onClick={() => openEditIndicator(ind)}
                              className="text-nord-gray hover:text-white flex items-center gap-1 text-xs"
                            >
                              <Pencil size={12} /> Editar
                            </button>
                            <button
                              onClick={() => setDeleteIndicatorTarget(ind)}
                              className="text-nord-gray hover:text-nord-danger flex items-center gap-1 text-xs"
                            >
                              <Trash2 size={12} /> Excluir indicador
                            </button>
                          </div>
                        </div>
                        <div className={ind.unidadeSecundaria ? "grid grid-cols-2 gap-3" : ""}>
                          <label className="block">
                            <span className="block text-xs text-nord-gray mb-1">Valor {unidadeSuffix(ind.unidade)}</span>
                            <input
                              type="number"
                              step="0.1"
                              value={entry.valorReferencia}
                              onChange={(e) => updateCustomForm(ind.id, { valorReferencia: e.target.value })}
                              className="input"
                            />
                          </label>
                          {/* Segundo valor (indicador "composto") — só aparece quando o indicador
                              tem unidadeSecundaria configurada. */}
                          {ind.unidadeSecundaria && (
                            <label className="block">
                              <span className="block text-xs text-nord-gray mb-1">
                                {ind.nomeSecundario} {unidadeSuffix(ind.unidadeSecundaria)}
                              </span>
                              <input
                                type="number"
                                step="0.1"
                                value={entry.valorSecundario}
                                onChange={(e) => updateCustomForm(ind.id, { valorSecundario: e.target.value })}
                                className="input"
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-nord-gray">Nenhum indicador cadastrado ainda.</p>
              )}

              <button
                onClick={() => setNewIndicatorOpen(true)}
                className="mt-3 flex items-center gap-1.5 text-xs text-nord-blue-light hover:underline"
              >
                <Plus size={13} /> Novo indicador
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-nord-border">
              {current ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 text-xs text-nord-danger hover:text-nord-danger/80"
                >
                  <Trash2 size={13} /> Excluir esta reunião
                </button>
              ) : (
                <span />
              )}
              <button
                onClick={async () => {
                  await submit();
                  setFechamentoModalOpen(false);
                }}
                disabled={saving}
                className="bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 px-4"
              >
                {saving ? "Salvando..." : current ? "Salvar alterações" : "Salvar fechamento do período"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Excluir reunião"
        message={
          deleteError ||
          `Tem certeza que deseja excluir o fechamento de ${periodoLabel(selectedPeriodo)}? Os resultados e observações desse período serão perdidos.`
        }
        onConfirm={doDelete}
        onCancel={() => {
          setConfirmDelete(false);
          setDeleteError(null);
        }}
        confirmLabel={deleting ? "Excluindo..." : "Excluir"}
        danger
      />

      <Modal open={newIndicatorOpen} onClose={() => setNewIndicatorOpen(false)} title="Novo indicador">
        <FormError message={newIndicatorError} />
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Nome</span>
            <input
              type="text"
              value={newIndicatorForm.nome}
              onChange={(e) => setNewIndicatorForm({ ...newIndicatorForm, nome: e.target.value })}
              placeholder="Ex.: NPS Delivery, Refeições servidas..."
              className="input"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Ícone</span>
            <IconPicker value={newIndicatorForm.icon} onChange={(icon) => setNewIndicatorForm({ ...newIndicatorForm, icon })} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Unidade</span>
              <select
                value={newIndicatorForm.unidade}
                onChange={(e) => setNewIndicatorForm({ ...newIndicatorForm, unidade: e.target.value as GerenteCustomIndicatorDTO["unidade"] })}
                className="input"
              >
                {Object.entries(UNIDADE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Valor padrão</span>
              <input
                type="number"
                step="0.1"
                value={newIndicatorForm.valorPadrao}
                onChange={(e) => setNewIndicatorForm({ ...newIndicatorForm, valorPadrao: e.target.value })}
                className="input"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-white cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={newIndicatorForm.hasSecondary}
              onChange={(e) => setNewIndicatorForm({ ...newIndicatorForm, hasSecondary: e.target.checked })}
            />
            Este indicador tem um segundo valor
          </label>
          {/* Ex.: "Cancelamentos" registra um percentual (campos acima) + uma quantidade de
              atrasos/cancelamentos (campos abaixo) — os dois valores por período. */}
          {newIndicatorForm.hasSecondary && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Nome do segundo valor</span>
                <input
                  type="text"
                  value={newIndicatorForm.nomeSecundario}
                  onChange={(e) => setNewIndicatorForm({ ...newIndicatorForm, nomeSecundario: e.target.value })}
                  placeholder="Ex.: Quantidade de atrasos"
                  className="input"
                />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Unidade do segundo valor</span>
                <select
                  value={newIndicatorForm.unidadeSecundaria}
                  onChange={(e) =>
                    setNewIndicatorForm({ ...newIndicatorForm, unidadeSecundaria: e.target.value as GerenteCustomIndicatorDTO["unidade"] })
                  }
                  className="input"
                >
                  {Object.entries(UNIDADE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <button
            onClick={createIndicator}
            disabled={creatingIndicator}
            className="mt-1 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 px-4"
          >
            {creatingIndicator ? "Criando..." : "Criar indicador"}
          </button>
        </div>
      </Modal>

      <Modal open={editIndicatorTarget !== null} onClose={() => setEditIndicatorTarget(null)} title="Editar indicador">
        <FormError message={editIndicatorError} />
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Nome</span>
            <input
              type="text"
              value={editIndicatorForm.nome}
              onChange={(e) => setEditIndicatorForm({ ...editIndicatorForm, nome: e.target.value })}
              placeholder="Ex.: NPS Delivery, Refeições servidas..."
              className="input"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Ícone</span>
            <IconPicker value={editIndicatorForm.icon} onChange={(icon) => setEditIndicatorForm({ ...editIndicatorForm, icon })} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Unidade</span>
              <select
                value={editIndicatorForm.unidade}
                onChange={(e) => setEditIndicatorForm({ ...editIndicatorForm, unidade: e.target.value as GerenteCustomIndicatorDTO["unidade"] })}
                className="input"
              >
                {Object.entries(UNIDADE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Valor padrão</span>
              <input
                type="number"
                step="0.1"
                value={editIndicatorForm.valorPadrao}
                onChange={(e) => setEditIndicatorForm({ ...editIndicatorForm, valorPadrao: e.target.value })}
                className="input"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-white cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={editIndicatorForm.hasSecondary}
              onChange={(e) => setEditIndicatorForm({ ...editIndicatorForm, hasSecondary: e.target.checked })}
            />
            Este indicador tem um segundo valor
          </label>
          {/* Desmarcar remove o 2º valor deste indicador (volta a ser simples) — o histórico
              de valores já salvos em meses anteriores permanece no banco, só deixa de
              aparecer/ser editável enquanto a opção estiver desmarcada. */}
          {editIndicatorForm.hasSecondary && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Nome do segundo valor</span>
                <input
                  type="text"
                  value={editIndicatorForm.nomeSecundario}
                  onChange={(e) => setEditIndicatorForm({ ...editIndicatorForm, nomeSecundario: e.target.value })}
                  placeholder="Ex.: Quantidade de atrasos"
                  className="input"
                />
              </label>
              <label className="block">
                <span className="block text-xs text-nord-gray mb-1">Unidade do segundo valor</span>
                <select
                  value={editIndicatorForm.unidadeSecundaria}
                  onChange={(e) =>
                    setEditIndicatorForm({ ...editIndicatorForm, unidadeSecundaria: e.target.value as GerenteCustomIndicatorDTO["unidade"] })
                  }
                  className="input"
                >
                  {Object.entries(UNIDADE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <button
            onClick={saveEditIndicator}
            disabled={savingEditIndicator}
            className="mt-1 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 px-4"
          >
            {savingEditIndicator ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteIndicatorTarget !== null}
        title="Excluir indicador"
        message={`Tem certeza que quer excluir o indicador "${deleteIndicatorTarget?.nome}"? Isso remove esse indicador e o histórico de valores dele em todos os meses — o restante da reunião não é afetado.`}
        confirmLabel={deletingIndicator ? "Excluindo..." : "Excluir"}
        danger
        onConfirm={confirmDeleteIndicator}
        onCancel={() => setDeleteIndicatorTarget(null)}
      />

      {canCreate && (
        <Section title="Observações da reunião">
          <textarea
            value={form.notas}
            onChange={(e) => setForm({ ...form, notas: e.target.value })}
            placeholder="Pontos discutidos, dicas de melhoria, combinados com a equipe..."
            className="input min-h-24"
          />
          <button
            onClick={submit}
            disabled={saving}
            className="mt-3 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 px-4"
          >
            {saving ? "Salvando..." : current ? "Atualizar fechamento do mês" : "Salvar fechamento do mês"}
          </button>
        </Section>
      )}

      {/* "Metas de [próximo mês]": metas cadastradas pra equipe bater no mês seguinte (sempre
          calculado a partir de hoje, nunca digitado) — cada uma com o que precisa ser feito
          (métrica + valor-alvo) e o prêmio ao bater (valor + destinatário, "Equipe" por
          padrão). Componente compartilhado com Salão/Cozinha/Delivery/Liderança — ver
          src/components/reuniao/metas-proximo-mes.tsx. Mesmo `canCreate` (isSingle) das
          outras seções desta tela; excluir uma meta pede além disso `canDeleteMetas` (perfil
          "gerente" tem canCreate/canEdit mas não canDelete no módulo "reuniao" — ver
          page.tsx). */}
      {canCreate && <MetasProximoMesSection mp={mp} canDelete={canDeleteMetas} />}

      {meetings.length > 0 && (
        <Section title="Histórico de reuniões">
          <div className="overflow-x-auto nord-scrollbar">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-white border-b border-nord-border">
                  <th className="py-2 px-3">
                    <span className="flex items-center gap-1.5">
                      <DynamicIcon name="Calendar" size={13} className="text-nord-blue-light" /> Período
                    </span>
                  </th>
                  <th className="py-2 px-3">
                    <span className="flex items-center gap-1.5">
                      <DynamicIcon name="DollarSign" size={13} className="text-nord-blue-light" /> Faturamento
                    </span>
                  </th>
                  <th className="py-2 px-3">
                    <span className="flex items-center gap-1.5">
                      <DynamicIcon name="Percent" size={13} className="text-nord-blue-light" /> CMV
                    </span>
                  </th>
                  <th className="py-2 px-3">
                    <span className="flex items-center gap-1.5">
                      <DynamicIcon name="UserMinus" size={13} className="text-nord-blue-light" /> Turnover
                    </span>
                  </th>
                  <th className="py-2 px-3">
                    <span className="flex items-center gap-1.5">
                      <DynamicIcon name="ClipboardCheck" size={13} className="text-nord-blue-light" /> Checklist
                    </span>
                  </th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {meetings.map((m) => (
                  <tr key={m.id} className={`border-b border-nord-border/50 ${m.periodo === selectedPeriodo ? "bg-white/5" : ""}`}>
                    <td className="py-2 px-3 text-white capitalize">{periodoLabel(m.periodo)}</td>
                    <td className="py-2 px-3 text-nord-gray">{m.faturamentoTotalValor === null ? "-" : formatCurrency(m.faturamentoTotalValor)}</td>
                    <td className="py-2 px-3 text-nord-gray">{m.cmvPercent === null ? "-" : `${formatNumber(m.cmvPercent, 1)}%`}</td>
                    <td className="py-2 px-3 text-nord-gray">{m.turnoverPercent === null ? "-" : `${m.turnoverPercent}%`}</td>
                    <td className="py-2 px-3 text-nord-gray">{m.checklistOperacionalPercent === null ? "-" : `${m.checklistOperacionalPercent}%`}</td>
                    <td className="py-2 px-3">
                      {canCreate && (
                        <button onClick={() => editHistoryRow(m)} className="text-nord-gray hover:text-white flex items-center gap-1 text-xs">
                          <Pencil size={12} /> Editar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <style jsx global>{`
        .input {
          width: 100%;
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
