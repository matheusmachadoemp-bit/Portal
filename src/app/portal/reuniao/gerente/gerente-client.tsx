"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, FileDown, Plus, Trash2, Trophy } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog, FormError } from "@/components/ui/modal";
import { DynamicIcon } from "@/components/dynamic-icon";
import { IconPicker } from "@/components/ui/icon-picker";
import { statusOf } from "@/components/reuniao/indicator-card";
import { CompareMonthsPicker } from "@/components/reuniao/compare-months";
import { indicatorAccentColor } from "@/components/reuniao/fechamento-do-mes";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { periodoLabel, periodoShortLabel, proximoMesPeriodo, resolveComparePeriodos } from "@/lib/reuniao";
import type { GerenteCustomIndicatorDTO } from "@/lib/reuniao-server";

type Meeting = {
  id: string;
  periodo: string;
  faturamentoTotalValor: number | null;
  cmvPercent: number | null;
  npsPercent: number | null;
  cancelamentoDeliveryPercent: number | null;
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

/** Uma meta do card "Metas de [próximo mês]" — ver model `MetaProximoMes` e as rotas
 * /api/reuniao/gerente/metas-proximo-mes(/[id]). */
type MetaProximoMes = {
  id: string;
  periodo: string;
  metrica: string;
  valorAlvo: string;
  valorPremio: number;
  destinatario: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  createdBy: { name: string };
};

function buildMetaForm(m?: MetaProximoMes | null) {
  return {
    metrica: m?.metrica ?? "",
    valorAlvo: m?.valorAlvo ?? "",
    valorPremio: m?.valorPremio != null ? String(m.valorPremio) : "",
    destinatario: m?.destinatario ?? "Equipe",
  };
}

function formToPayload(periodo: string, form: ReturnType<typeof buildForm>) {
  return { periodo, ...form };
}

function buildForm(m?: Meeting | null) {
  return {
    turnoverPercent: m?.turnoverPercent != null ? String(m.turnoverPercent) : "",
    faltasAtrasosAtestados: m?.faltasAtrasosAtestados != null ? String(m.faltasAtrasosAtestados) : "",
    checklistOperacionalPercent: m?.checklistOperacionalPercent != null ? String(m.checklistOperacionalPercent) : "",
    notas: m?.notas ?? "",
  };
}

type CustomForm = Record<string, { valor: string; valorReferencia: string }>;

function buildCustomForm(indicators: GerenteCustomIndicatorDTO[]): CustomForm {
  return Object.fromEntries(
    indicators.map((ind) => [
      ind.id,
      {
        valor: ind.valor != null ? String(ind.valor) : "",
        valorReferencia: String(ind.valorReferencia),
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
  const [newIndicatorForm, setNewIndicatorForm] = useState({
    nome: "",
    unidade: "PERCENT" as GerenteCustomIndicatorDTO["unidade"],
    icon: "Target",
    valorPadrao: "",
  });
  const [creatingIndicator, setCreatingIndicator] = useState(false);
  const [newIndicatorError, setNewIndicatorError] = useState<string | null>(null);
  const [deleteIndicatorTarget, setDeleteIndicatorTarget] = useState<GerenteCustomIndicatorDTO | null>(null);
  const [deletingIndicator, setDeletingIndicator] = useState(false);
  const [editIndicatorTarget, setEditIndicatorTarget] = useState<GerenteCustomIndicatorDTO | null>(null);
  const [editIndicatorForm, setEditIndicatorForm] = useState({
    nome: "",
    unidade: "PERCENT" as GerenteCustomIndicatorDTO["unidade"],
    icon: "Target",
    valorPadrao: "",
  });
  const [savingEditIndicator, setSavingEditIndicator] = useState(false);
  const [editIndicatorError, setEditIndicatorError] = useState<string | null>(null);

  const [metas, setMetas] = useState<MetaProximoMes[]>([]);
  // Só começa "carregando" quando o card vai mesmo aparecer (canCreate) — evita precisar
  // setState síncrono dentro do efeito abaixo só pra desligar o loading no modo Grupo Nord.
  const [metasLoading, setMetasLoading] = useState(canCreate);
  const [newMetaOpen, setNewMetaOpen] = useState(false);
  const [newMetaForm, setNewMetaForm] = useState(buildMetaForm(null));
  const [creatingMeta, setCreatingMeta] = useState(false);
  const [newMetaError, setNewMetaError] = useState<string | null>(null);
  const [editMetaTarget, setEditMetaTarget] = useState<MetaProximoMes | null>(null);
  const [editMetaForm, setEditMetaForm] = useState(buildMetaForm(null));
  const [savingEditMeta, setSavingEditMeta] = useState(false);
  const [editMetaError, setEditMetaError] = useState<string | null>(null);
  const [deleteMetaTarget, setDeleteMetaTarget] = useState<MetaProximoMes | null>(null);
  const [deletingMeta, setDeletingMeta] = useState(false);

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

  // Metas de "próximo mês" (proximoMesPeriodo(), sempre o mês seguinte a hoje) — carregadas
  // uma única vez ao montar, sem depender de `selectedPeriodo` (que é sobre o histórico de
  // fechamentos, um assunto diferente do mês-alvo das metas). Em modo Grupo Nord a própria
  // API já devolve lista vazia (ver comentário da rota GET).
  useEffect(() => {
    if (!canCreate) return;
    let cancelled = false;
    fetch("/api/reuniao/gerente/metas-proximo-mes")
      .then((res) => res.json())
      .then((data) => !cancelled && setMetas(data.metas ?? []))
      .finally(() => !cancelled && setMetasLoading(false));
    return () => {
      cancelled = true;
    };
  }, [canCreate]);

  async function refreshMetas() {
    const res = await fetch("/api/reuniao/gerente/metas-proximo-mes");
    const data = await res.json();
    setMetas(data.metas ?? []);
  }

  async function createMeta() {
    if (creatingMeta) return;
    setNewMetaError(null);
    if (!newMetaForm.metrica.trim()) {
      setNewMetaError("Informe a métrica da meta (ex.: CMV, Tempo Pedido).");
      return;
    }
    if (!newMetaForm.valorAlvo.trim()) {
      setNewMetaError("Informe o valor-alvo da meta (ex.: 35%, 15min).");
      return;
    }
    setCreatingMeta(true);
    try {
      const res = await fetch("/api/reuniao/gerente/metas-proximo-mes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newMetaForm),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setNewMetaError(data?.error ?? "Não foi possível criar a meta.");
        return;
      }
      setNewMetaOpen(false);
      setNewMetaForm(buildMetaForm(null));
      await refreshMetas();
    } finally {
      setCreatingMeta(false);
    }
  }

  function openEditMeta(meta: MetaProximoMes) {
    setEditMetaTarget(meta);
    setEditMetaForm(buildMetaForm(meta));
    setEditMetaError(null);
  }

  async function saveEditMeta() {
    if (!editMetaTarget || savingEditMeta) return;
    setEditMetaError(null);
    if (!editMetaForm.metrica.trim()) {
      setEditMetaError("Informe a métrica da meta.");
      return;
    }
    if (!editMetaForm.valorAlvo.trim()) {
      setEditMetaError("Informe o valor-alvo da meta.");
      return;
    }
    setSavingEditMeta(true);
    try {
      const res = await fetch(`/api/reuniao/gerente/metas-proximo-mes/${editMetaTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editMetaForm),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setEditMetaError(data?.error ?? "Não foi possível salvar as alterações da meta.");
        return;
      }
      setEditMetaTarget(null);
      await refreshMetas();
    } finally {
      setSavingEditMeta(false);
    }
  }

  async function confirmDeleteMeta() {
    if (!deleteMetaTarget || deletingMeta) return;
    setDeletingMeta(true);
    try {
      await fetch(`/api/reuniao/gerente/metas-proximo-mes/${deleteMetaTarget.id}`, { method: "DELETE" });
      setDeleteMetaTarget(null);
      await refreshMetas();
    } finally {
      setDeletingMeta(false);
    }
  }

  const turnoverValor = form.turnoverPercent ? Number(form.turnoverPercent) : null;
  const checklistValor = form.checklistOperacionalPercent ? Number(form.checklistOperacionalPercent) : null;

  function customIndicatorState(ind: GerenteCustomIndicatorDTO) {
    const entry = customForm[ind.id] ?? { valor: "", valorReferencia: String(ind.valorPadrao) };
    const valor = entry.valor !== "" ? Number(entry.valor) : null;
    const valorReferencia = Number(entry.valorReferencia) || 0;
    return { entry, valor, valorReferencia };
  }

  function updateCustomForm(id: string, patch: Partial<CustomForm[string]>) {
    setCustomForm((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function exportPdf() {
    const { exportMeetingReportPdf } = await import("@/lib/reuniao-pdf");
    const periodosComparados = resolveComparePeriodos(selectedPeriodo, comparePeriodos);

    // Busca as metas do próximo mês na hora de exportar (não reaproveita o estado `metas`
    // já carregado na tela) pra garantir que o PDF sai com o que está salvo agora — inclusive
    // em modo Grupo Nord, onde a API já devolve lista vazia e o PDF mostra a mensagem de
    // "nenhuma meta cadastrada" em vez de pular a página.
    const metasRes = await fetch("/api/reuniao/gerente/metas-proximo-mes");
    const metasData = metasRes.ok
      ? await metasRes.json()
      : { metas: [], periodoLabel: periodoLabel(proximoMesPeriodo()) };

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
        periodoLabel: metasData.periodoLabel ?? periodoLabel(proximoMesPeriodo()),
        metas: (metasData.metas ?? []).map((m: MetaProximoMes) => ({
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
    setCreatingIndicator(true);
    try {
      const res = await fetch("/api/reuniao/gerente/indicadores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newIndicatorForm),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setNewIndicatorError(data?.error ?? "Não foi possível criar o indicador.");
        return;
      }
      setNewIndicatorOpen(false);
      setNewIndicatorForm({ nome: "", unidade: "PERCENT", icon: "Target", valorPadrao: "" });
      await refresh(selectedPeriodo);
    } finally {
      setCreatingIndicator(false);
    }
  }

  function openEditIndicator(ind: GerenteCustomIndicatorDTO) {
    setEditIndicatorTarget(ind);
    setEditIndicatorForm({ nome: ind.nome, unidade: ind.unidade, icon: ind.icon, valorPadrao: String(ind.valorPadrao) });
    setEditIndicatorError(null);
  }

  async function saveEditIndicator() {
    if (!editIndicatorTarget || savingEditIndicator) return;
    setEditIndicatorError(null);
    if (!editIndicatorForm.nome.trim()) {
      setEditIndicatorError("Informe um nome para o indicador.");
      return;
    }
    setSavingEditIndicator(true);
    try {
      const res = await fetch(`/api/reuniao/gerente/indicadores/${editIndicatorTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editIndicatorForm),
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
                const { valorReferencia } = customIndicatorState(ind);
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
                    <p className="text-sm min-w-0 truncate">
                      <span className="text-nord-gray">{ind.nome}:</span>{" "}
                      <span className="text-white font-semibold">{formatCustomValue(ind.unidade, valorReferencia)}</span>
                    </p>
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
              <p className="text-xs text-nord-gray mb-2 font-medium">Resultado do período</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">Turnover (%)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={form.turnoverPercent}
                    onChange={(e) => setForm({ ...form, turnoverPercent: e.target.value })}
                    placeholder="%"
                    className="input"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">Faltas/Atrasos/Atestados</span>
                  <input
                    type="number"
                    value={form.faltasAtrasosAtestados}
                    onChange={(e) => setForm({ ...form, faltasAtrasosAtestados: e.target.value })}
                    placeholder="qtd"
                    className="input"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">Checklist Operacional (%)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={form.checklistOperacionalPercent}
                    onChange={(e) => setForm({ ...form, checklistOperacionalPercent: e.target.value })}
                    placeholder="%"
                    className="input"
                  />
                </label>
                {customIndicators.map((ind) => (
                  <label key={ind.id} className="block">
                    <span className="block text-xs text-nord-gray mb-1">{ind.nome}</span>
                    <input
                      type="number"
                      step="0.1"
                      value={customForm[ind.id]?.valor ?? ""}
                      onChange={(e) => updateCustomForm(ind.id, { valor: e.target.value })}
                      placeholder={ind.unidade === "PERCENT" ? "%" : ind.unidade === "CURRENCY" ? "R$" : "valor"}
                      className="input"
                    />
                  </label>
                ))}
              </div>
            </div>

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
                    const entry = customForm[ind.id] ?? { valor: "", valorReferencia: String(ind.valorPadrao) };
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
                        <label className="block">
                          <span className="block text-xs text-nord-gray mb-1">
                            Valor {ind.unidade === "PERCENT" ? "(%)" : ind.unidade === "CURRENCY" ? "(R$)" : ""}
                          </span>
                          <input
                            type="number"
                            step="0.1"
                            value={entry.valorReferencia}
                            onChange={(e) => updateCustomForm(ind.id, { valorReferencia: e.target.value })}
                            className="input"
                          />
                        </label>
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
          calculado a partir de hoje via proximoMesPeriodo(), nunca digitado) — cada uma com o
          que precisa ser feito (métrica + valor-alvo) e o prêmio ao bater (valor + destinatário,
          "Equipe" por padrão). Mesmo `canCreate` (isSingle) das outras seções desta tela;
          excluir uma meta pede além disso `canDeleteMetas` (perfil "gerente" tem
          canCreate/canEdit mas não canDelete no módulo "reuniao" — ver page.tsx). */}
      {canCreate && (
        <Section
          title={`Metas de ${periodoLabel(proximoMesPeriodo())}`}
          titleClassName="capitalize"
          action={
            <button
              onClick={() => setNewMetaOpen(true)}
              className="flex items-center gap-1 text-xs text-nord-blue-light hover:underline"
            >
              <Plus size={12} /> Nova meta
            </button>
          }
        >
          {metasLoading ? (
            <p className="text-xs text-nord-gray">Carregando metas...</p>
          ) : metas.length > 0 ? (
            <div className="space-y-2">
              {metas.map((meta, index) => {
                const color = indicatorAccentColor(index);
                return (
                  <div
                    key={meta.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-nord-border/60 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${color}22` }}
                      >
                        <Trophy size={15} style={{ color }} />
                      </div>
                      <p className="text-sm min-w-0 truncate">
                        <span className="text-white font-semibold">
                          {meta.metrica}: {meta.valorAlvo}
                        </span>{" "}
                        <span className="text-nord-gray">→ Ganha</span>{" "}
                        <span className="text-nord-success font-semibold">{formatCurrency(meta.valorPremio)}</span>{" "}
                        <span className="text-nord-gray">{meta.destinatario}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => openEditMeta(meta)}
                        className="text-nord-gray hover:text-white flex items-center gap-1 text-xs"
                      >
                        <Pencil size={12} /> Editar
                      </button>
                      {canDeleteMetas && (
                        <button
                          onClick={() => setDeleteMetaTarget(meta)}
                          className="text-nord-gray hover:text-nord-danger flex items-center gap-1 text-xs"
                        >
                          <Trash2 size={12} /> Excluir
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-nord-gray">
              Nenhuma meta cadastrada ainda para {periodoLabel(proximoMesPeriodo())}. Clique em &quot;Nova meta&quot; para
              adicionar a primeira (ex.: CMV: 35% → Ganha R$500 Equipe).
            </p>
          )}
        </Section>
      )}

      <Modal open={newMetaOpen} onClose={() => setNewMetaOpen(false)} title="Nova meta">
        <FormError message={newMetaError} />
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Métrica</span>
              <input
                type="text"
                value={newMetaForm.metrica}
                onChange={(e) => setNewMetaForm({ ...newMetaForm, metrica: e.target.value })}
                placeholder="Ex.: CMV, Tempo Pedido..."
                className="input"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Valor-alvo</span>
              <input
                type="text"
                value={newMetaForm.valorAlvo}
                onChange={(e) => setNewMetaForm({ ...newMetaForm, valorAlvo: e.target.value })}
                placeholder="Ex.: 35%, 15min..."
                className="input"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Prêmio ao bater a meta (R$)</span>
              <input
                type="number"
                step="0.01"
                value={newMetaForm.valorPremio}
                onChange={(e) => setNewMetaForm({ ...newMetaForm, valorPremio: e.target.value })}
                placeholder="R$"
                className="input"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Destinatário</span>
              <input
                type="text"
                value={newMetaForm.destinatario}
                onChange={(e) => setNewMetaForm({ ...newMetaForm, destinatario: e.target.value })}
                placeholder="Equipe"
                className="input"
              />
            </label>
          </div>
          <button
            onClick={createMeta}
            disabled={creatingMeta}
            className="mt-1 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 px-4"
          >
            {creatingMeta ? "Criando..." : "Criar meta"}
          </button>
        </div>
      </Modal>

      <Modal open={editMetaTarget !== null} onClose={() => setEditMetaTarget(null)} title="Editar meta">
        <FormError message={editMetaError} />
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Métrica</span>
              <input
                type="text"
                value={editMetaForm.metrica}
                onChange={(e) => setEditMetaForm({ ...editMetaForm, metrica: e.target.value })}
                placeholder="Ex.: CMV, Tempo Pedido..."
                className="input"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Valor-alvo</span>
              <input
                type="text"
                value={editMetaForm.valorAlvo}
                onChange={(e) => setEditMetaForm({ ...editMetaForm, valorAlvo: e.target.value })}
                placeholder="Ex.: 35%, 15min..."
                className="input"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Prêmio ao bater a meta (R$)</span>
              <input
                type="number"
                step="0.01"
                value={editMetaForm.valorPremio}
                onChange={(e) => setEditMetaForm({ ...editMetaForm, valorPremio: e.target.value })}
                placeholder="R$"
                className="input"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Destinatário</span>
              <input
                type="text"
                value={editMetaForm.destinatario}
                onChange={(e) => setEditMetaForm({ ...editMetaForm, destinatario: e.target.value })}
                placeholder="Equipe"
                className="input"
              />
            </label>
          </div>
          <button
            onClick={saveEditMeta}
            disabled={savingEditMeta}
            className="mt-1 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 px-4"
          >
            {savingEditMeta ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteMetaTarget !== null}
        title="Excluir meta"
        message={`Tem certeza que quer excluir a meta "${deleteMetaTarget?.metrica}: ${deleteMetaTarget?.valorAlvo}"? Essa ação não pode ser desfeita.`}
        confirmLabel={deletingMeta ? "Excluindo..." : "Excluir"}
        danger
        onConfirm={confirmDeleteMeta}
        onCancel={() => setDeleteMetaTarget(null)}
      />

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
