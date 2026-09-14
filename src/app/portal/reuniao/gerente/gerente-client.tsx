"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, FileDown, Plus, Trash2 } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { SortableCardGrid } from "@/components/ui/sortable-stat-cards";
import { Modal, ConfirmDialog, FormError } from "@/components/ui/modal";
import { DynamicIcon } from "@/components/dynamic-icon";
import { IndicatorCard, statusOf } from "@/components/reuniao/indicator-card";
import { CompareMonthsPicker } from "@/components/reuniao/compare-months";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { compareToPrevious, periodoLabel, periodoShortLabel, previousPeriodo, resolveComparePeriodos } from "@/lib/reuniao";
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
  faturamentoMetaValor: number;
  cmvMetaPercent: number;
  turnoverMetaPercent: number;
  checklistOperacionalMetaPercent: number;
  premiacaoFaturamento: number;
  premiacaoCmv: number;
  premiacaoTurnover: number;
  premiacaoChecklist: number;
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
  return {
    turnoverPercent: m?.turnoverPercent != null ? String(m.turnoverPercent) : "",
    faltasAtrasosAtestados: m?.faltasAtrasosAtestados != null ? String(m.faltasAtrasosAtestados) : "",
    checklistOperacionalPercent: m?.checklistOperacionalPercent != null ? String(m.checklistOperacionalPercent) : "",
    faturamentoMetaValor: String(m?.faturamentoMetaValor ?? 0),
    cmvMetaPercent: String(m?.cmvMetaPercent ?? 30),
    turnoverMetaPercent: String(m?.turnoverMetaPercent ?? 5),
    checklistOperacionalMetaPercent: String(m?.checklistOperacionalMetaPercent ?? 90),
    premiacaoFaturamento: String(m?.premiacaoFaturamento ?? 100),
    premiacaoCmv: String(m?.premiacaoCmv ?? 100),
    premiacaoTurnover: String(m?.premiacaoTurnover ?? 100),
    premiacaoChecklist: String(m?.premiacaoChecklist ?? 100),
    notas: m?.notas ?? "",
  };
}

type CustomForm = Record<string, { valor: string; metaValue: string; premiacaoValor: string }>;

function buildCustomForm(indicators: GerenteCustomIndicatorDTO[]): CustomForm {
  return Object.fromEntries(
    indicators.map((ind) => [
      ind.id,
      {
        valor: ind.valor != null ? String(ind.valor) : "",
        metaValue: String(ind.metaValue),
        premiacaoValor: String(ind.premiacaoValor),
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

function meetingPremiacaoTotal(m: Meeting) {
  return (
    (m.faturamentoTotalValor !== null && m.faturamentoMetaValor > 0 && m.faturamentoTotalValor >= m.faturamentoMetaValor
      ? m.premiacaoFaturamento
      : 0) +
    (m.cmvPercent !== null && m.cmvPercent <= m.cmvMetaPercent ? m.premiacaoCmv : 0) +
    (m.turnoverPercent !== null && m.turnoverPercent <= m.turnoverMetaPercent ? m.premiacaoTurnover : 0) +
    (m.checklistOperacionalPercent !== null && m.checklistOperacionalPercent >= m.checklistOperacionalMetaPercent
      ? m.premiacaoChecklist
      : 0)
  );
}

export function GerenteClient({
  initialMeetings,
  initialCurrent,
  initialMetrics,
  initialCustomIndicators,
  periodo,
  canCreate,
  empresaName,
}: {
  initialMeetings: Meeting[];
  initialCurrent: Meeting | null;
  initialMetrics: Metrics;
  initialCustomIndicators: GerenteCustomIndicatorDTO[];
  periodo: string;
  canCreate: boolean;
  empresaName: string;
}) {
  const [meetings, setMeetings] = useState(initialMeetings);
  const [selectedPeriodo, setSelectedPeriodo] = useState(periodo);
  const [current, setCurrent] = useState(initialCurrent);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [form, setForm] = useState(buildForm(initialCurrent));
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showMetas, setShowMetas] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [comparePeriodos, setComparePeriodos] = useState<[string, string, string]>(["", "", ""]);

  const [customIndicators, setCustomIndicators] = useState(initialCustomIndicators);
  const [customForm, setCustomForm] = useState(buildCustomForm(initialCustomIndicators));
  const [newMetaOpen, setNewMetaOpen] = useState(false);
  const [newMetaForm, setNewMetaForm] = useState({
    nome: "",
    unidade: "PERCENT" as GerenteCustomIndicatorDTO["unidade"],
    direcao: "MIN" as GerenteCustomIndicatorDTO["direcao"],
    metaPadrao: "",
    premiacaoPadrao: "",
  });
  const [creatingMeta, setCreatingMeta] = useState(false);
  const [newMetaError, setNewMetaError] = useState<string | null>(null);
  const [deleteMetaTarget, setDeleteMetaTarget] = useState<GerenteCustomIndicatorDTO | null>(null);
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

  const faturamentoMeta = Number(form.faturamentoMetaValor) || 0;
  const cmvMeta = Number(form.cmvMetaPercent) || 0;
  const turnoverMeta = Number(form.turnoverMetaPercent) || 0;
  const checklistMeta = Number(form.checklistOperacionalMetaPercent) || 0;

  const turnoverValor = form.turnoverPercent ? Number(form.turnoverPercent) : null;
  const faltasValor = form.faltasAtrasosAtestados ? Number(form.faltasAtrasosAtestados) : null;
  const checklistValor = form.checklistOperacionalPercent ? Number(form.checklistOperacionalPercent) : null;

  const bateuFaturamento =
    metrics.faturamentoTotalValor === null || faturamentoMeta <= 0 ? null : metrics.faturamentoTotalValor >= faturamentoMeta;
  const bateuCmv = metrics.cmvPercent === null ? null : metrics.cmvPercent <= cmvMeta;
  const bateuTurnover = turnoverValor === null ? null : turnoverValor <= turnoverMeta;
  const bateuChecklist = checklistValor === null ? null : checklistValor >= checklistMeta;

  const previousMeeting = useMemo(
    () => meetings.find((m) => m.periodo === previousPeriodo(selectedPeriodo)) ?? null,
    [meetings, selectedPeriodo]
  );
  const compFaturamento = compareToPrevious(metrics.faturamentoTotalValor, previousMeeting?.faturamentoTotalValor, "max");
  const compCmv = compareToPrevious(metrics.cmvPercent, previousMeeting?.cmvPercent, "min");
  const compNps = compareToPrevious(metrics.npsPercent, previousMeeting?.npsPercent, "max");
  const compCancelamentoDelivery = compareToPrevious(
    metrics.cancelamentoDeliveryPercent,
    previousMeeting?.cancelamentoDeliveryPercent,
    "min"
  );
  const compTurnover = compareToPrevious(turnoverValor, previousMeeting?.turnoverPercent, "min");
  const compFaltas = compareToPrevious(faltasValor, previousMeeting?.faltasAtrasosAtestados, "min");
  const compChecklist = compareToPrevious(checklistValor, previousMeeting?.checklistOperacionalPercent, "max");

  const premiacaoTotal = useMemo(() => {
    let total = 0;
    if (bateuFaturamento) total += Number(form.premiacaoFaturamento) || 0;
    if (bateuCmv) total += Number(form.premiacaoCmv) || 0;
    if (bateuTurnover) total += Number(form.premiacaoTurnover) || 0;
    if (bateuChecklist) total += Number(form.premiacaoChecklist) || 0;
    return total;
  }, [bateuFaturamento, bateuCmv, bateuTurnover, bateuChecklist, form]);

  function customIndicatorState(ind: GerenteCustomIndicatorDTO) {
    const entry = customForm[ind.id] ?? { valor: "", metaValue: String(ind.metaPadrao), premiacaoValor: String(ind.premiacaoPadrao) };
    const valor = entry.valor !== "" ? Number(entry.valor) : null;
    const meta = Number(entry.metaValue) || 0;
    const premio = Number(entry.premiacaoValor) || 0;
    const bateu = valor === null ? null : ind.direcao === "MIN" ? valor <= meta : valor >= meta;
    return { entry, valor, meta, premio, bateu };
  }

  function updateCustomForm(id: string, patch: Partial<CustomForm[string]>) {
    setCustomForm((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function exportPdf() {
    const { exportMeetingReportPdf } = await import("@/lib/reuniao-pdf");
    const periodosComparados = resolveComparePeriodos(selectedPeriodo, comparePeriodos);

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

    exportMeetingReportPdf({
      fileSlug: "reuniao-gerente",
      empresaName,
      periodoLabel: periodoLabel(selectedPeriodo),
      premiacaoTotal,
      observacoes: form.notas,
      indicators: [
        {
          key: "faturamento",
          label: "Faturamento Total",
          unit: "currency",
          meta: faturamentoMeta,
          metaDirection: "max",
          status: statusOf(bateuFaturamento),
          premio: bateuFaturamento ? Number(form.premiacaoFaturamento) || 0 : 0,
          historico: historico("faturamentoTotalValor", metrics.faturamentoTotalValor),
        },
        {
          key: "cmv",
          label: "CMV",
          unit: "percent",
          meta: cmvMeta,
          metaDirection: "min",
          status: statusOf(bateuCmv),
          premio: bateuCmv ? Number(form.premiacaoCmv) || 0 : 0,
          historico: historico("cmvPercent", metrics.cmvPercent),
        },
        {
          key: "turnover",
          label: "Turnover",
          unit: "percent",
          meta: turnoverMeta,
          metaDirection: "min",
          status: statusOf(bateuTurnover),
          premio: bateuTurnover ? Number(form.premiacaoTurnover) || 0 : 0,
          historico: historico("turnoverPercent", turnoverValor),
        },
        {
          key: "checklist",
          label: "Checklist Operacional",
          unit: "percent",
          meta: checklistMeta,
          metaDirection: "max",
          status: statusOf(bateuChecklist),
          premio: bateuChecklist ? Number(form.premiacaoChecklist) || 0 : 0,
          historico: historico("checklistOperacionalPercent", checklistValor),
        },
      ],
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

  async function createMeta() {
    if (creatingMeta) return;
    setNewMetaError(null);
    if (!newMetaForm.nome.trim()) {
      setNewMetaError("Informe um nome para a meta.");
      return;
    }
    setCreatingMeta(true);
    try {
      const res = await fetch("/api/reuniao/gerente/indicadores", {
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
      setNewMetaForm({ nome: "", unidade: "PERCENT", direcao: "MIN", metaPadrao: "", premiacaoPadrao: "" });
      await refresh(selectedPeriodo);
    } finally {
      setCreatingMeta(false);
    }
  }

  async function confirmDeleteMeta() {
    if (!deleteMetaTarget || deletingMeta) return;
    setDeletingMeta(true);
    try {
      await fetch(`/api/reuniao/gerente/indicadores/${deleteMetaTarget.id}`, { method: "DELETE" });
      setDeleteMetaTarget(null);
      await refresh(selectedPeriodo);
    } finally {
      setDeletingMeta(false);
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
    setShowMetas(true);
  }

  const cards = [
    {
      key: "faturamento",
      content: (
        <IndicatorCard
          icon="DollarSign"
          color="#22c55e"
          label="Faturamento Total"
          status={statusOf(bateuFaturamento)}
          valueSlot={
            <span className="text-2xl font-semibold text-white">
              {metrics.faturamentoTotalValor === null ? "-" : formatCurrency(metrics.faturamentoTotalValor)}
            </span>
          }
          metaText={`Meta: mín. ${formatCurrency(faturamentoMeta)}`}
          premio={Number(form.premiacaoFaturamento) || 0}
          comparison={compFaturamento}
        />
      ),
    },
    {
      key: "cmv",
      content: (
        <IndicatorCard
          icon="Percent"
          color="#1464F4"
          label="CMV"
          status={statusOf(bateuCmv)}
          valueSlot={
            <span className="text-2xl font-semibold text-white">
              {metrics.cmvPercent === null ? "-" : `${formatNumber(metrics.cmvPercent, 1)}%`}
            </span>
          }
          metaText={`Meta: até ${formatNumber(cmvMeta, 1)}%`}
          premio={Number(form.premiacaoCmv) || 0}
          comparison={compCmv}
        />
      ),
    },
    {
      key: "nps",
      content: (
        <IndicatorCard
          icon="Smile"
          color="#f59e0b"
          label="NPS Geral"
          status="sem-dado"
          valueSlot={
            <span className="text-2xl font-semibold text-white">
              {metrics.npsPercent === null ? "-" : `${formatNumber(metrics.npsPercent, 1)}%`}
            </span>
          }
          metaText="Detalhado na Reunião Salão"
          premio={0}
          comparison={compNps}
        />
      ),
    },
    {
      key: "cancelamento-delivery",
      content: (
        <IndicatorCard
          icon="XCircle"
          color="#ef4444"
          label="Cancelamento Delivery"
          status="sem-dado"
          valueSlot={
            <span className="text-2xl font-semibold text-white">
              {metrics.cancelamentoDeliveryPercent === null ? "-" : `${formatNumber(metrics.cancelamentoDeliveryPercent, 1)}%`}
            </span>
          }
          metaText="Detalhado na Reunião Delivery"
          premio={0}
          comparison={compCancelamentoDelivery}
        />
      ),
    },
    {
      key: "turnover",
      content: (
        <IndicatorCard
          icon="UserMinus"
          color="#a855f7"
          label="Turnover"
          status={statusOf(bateuTurnover)}
          valueSlot={<span className="text-2xl font-semibold text-white">{turnoverValor === null ? "-" : `${turnoverValor}%`}</span>}
          metaText={`Meta: até ${formatNumber(turnoverMeta, 1)}%`}
          premio={Number(form.premiacaoTurnover) || 0}
          comparison={compTurnover}
        />
      ),
    },
    {
      key: "faltas",
      content: (
        <IndicatorCard
          icon="CalendarX"
          color="#f97316"
          label="Faltas/Atrasos/Atestados"
          status="sem-dado"
          valueSlot={<span className="text-2xl font-semibold text-white">{faltasValor ?? "-"}</span>}
          metaText="Indicador informativo"
          premio={0}
          comparison={compFaltas}
        />
      ),
    },
    {
      key: "checklist",
      content: (
        <IndicatorCard
          icon="ClipboardCheck"
          color="#14b8a6"
          label="Checklist Operacional"
          status={statusOf(bateuChecklist)}
          valueSlot={
            <span className="text-2xl font-semibold text-white">{checklistValor === null ? "-" : `${checklistValor}%`}</span>
          }
          metaText={`Meta: mín. ${formatNumber(checklistMeta, 1)}%`}
          premio={Number(form.premiacaoChecklist) || 0}
          comparison={compChecklist}
        />
      ),
    },
    ...customIndicators.map((ind) => {
      const { valor, meta, premio, bateu } = customIndicatorState(ind);
      const metaText = ind.direcao === "MIN" ? `Meta: até ${formatCustomValue(ind.unidade, meta)}` : `Meta: mín. ${formatCustomValue(ind.unidade, meta)}`;
      return {
        key: `custom-${ind.id}`,
        content: (
          <IndicatorCard
            icon={ind.icon}
            color="#64748b"
            label={ind.nome}
            status={statusOf(bateu)}
            valueSlot={
              <span className="text-2xl font-semibold text-white">
                {valor === null ? "-" : formatCustomValue(ind.unidade, valor)}
              </span>
            }
            metaText={metaText}
            premio={premio}
          />
        ),
      };
    }),
  ];

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
            <button onClick={() => setShowMetas(true)} className="text-xs text-nord-blue-light hover:underline">
              Editar metas e premiação
            </button>
          )}
        </div>
      </div>

      <SortableCardGrid
        storageKey="reuniao-gerente-kpi-order"
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4"
        items={cards}
      />

      {canCreate && (
        <Modal
          open={showMetas}
          onClose={() => setShowMetas(false)}
          title={`Metas e premiação — ${periodoLabel(selectedPeriodo)}`}
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
              <p className="text-xs text-nord-gray mb-2 font-medium">Metas e premiação</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">Meta Faturamento (R$)</span>
                  <input type="number" value={form.faturamentoMetaValor} onChange={(e) => setForm({ ...form, faturamentoMetaValor: e.target.value })} className="input" />
                </label>
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">Meta CMV (%)</span>
                  <input type="number" value={form.cmvMetaPercent} onChange={(e) => setForm({ ...form, cmvMetaPercent: e.target.value })} className="input" />
                </label>
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">Meta Turnover (%)</span>
                  <input type="number" step="0.1" value={form.turnoverMetaPercent} onChange={(e) => setForm({ ...form, turnoverMetaPercent: e.target.value })} className="input" />
                </label>
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">Meta Checklist Operacional (%)</span>
                  <input type="number" step="0.1" value={form.checklistOperacionalMetaPercent} onChange={(e) => setForm({ ...form, checklistOperacionalMetaPercent: e.target.value })} className="input" />
                </label>
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">Premiação Faturamento (R$)</span>
                  <input type="number" value={form.premiacaoFaturamento} onChange={(e) => setForm({ ...form, premiacaoFaturamento: e.target.value })} className="input" />
                </label>
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">Premiação CMV (R$)</span>
                  <input type="number" value={form.premiacaoCmv} onChange={(e) => setForm({ ...form, premiacaoCmv: e.target.value })} className="input" />
                </label>
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">Premiação Turnover (R$)</span>
                  <input type="number" value={form.premiacaoTurnover} onChange={(e) => setForm({ ...form, premiacaoTurnover: e.target.value })} className="input" />
                </label>
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">Premiação Checklist (R$)</span>
                  <input type="number" value={form.premiacaoChecklist} onChange={(e) => setForm({ ...form, premiacaoChecklist: e.target.value })} className="input" />
                </label>
              </div>

              {customIndicators.length > 0 && (
                <div className="mt-4 space-y-3">
                  {customIndicators.map((ind) => {
                    const entry = customForm[ind.id] ?? { valor: "", metaValue: "", premiacaoValor: "" };
                    return (
                      <div key={ind.id} className="rounded-lg border border-nord-border/60 p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-sm text-white font-medium">{ind.nome}</span>
                          <button
                            onClick={() => setDeleteMetaTarget(ind)}
                            className="text-nord-gray hover:text-red-400 flex items-center gap-1 text-xs shrink-0"
                          >
                            <Trash2 size={12} /> Excluir meta
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="block">
                            <span className="block text-xs text-nord-gray mb-1">
                              Meta ({ind.direcao === "MIN" ? "até" : "mín."}) {ind.unidade === "PERCENT" ? "%" : ind.unidade === "CURRENCY" ? "R$" : ""}
                            </span>
                            <input
                              type="number"
                              step="0.1"
                              value={entry.metaValue}
                              onChange={(e) => updateCustomForm(ind.id, { metaValue: e.target.value })}
                              className="input"
                            />
                          </label>
                          <label className="block">
                            <span className="block text-xs text-nord-gray mb-1">Premiação (R$)</span>
                            <input
                              type="number"
                              value={entry.premiacaoValor}
                              onChange={(e) => updateCustomForm(ind.id, { premiacaoValor: e.target.value })}
                              className="input"
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                onClick={() => setNewMetaOpen(true)}
                className="mt-3 flex items-center gap-1.5 text-xs text-nord-blue-light hover:underline"
              >
                <Plus size={13} /> Nova meta
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-nord-border">
              {current ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300"
                >
                  <Trash2 size={13} /> Excluir esta reunião
                </button>
              ) : (
                <span />
              )}
              <button
                onClick={async () => {
                  await submit();
                  setShowMetas(false);
                }}
                disabled={saving}
                className="bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 px-4"
              >
                {saving ? "Salvando..." : current ? "Salvar alterações" : "Criar metas do período"}
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
          `Tem certeza que deseja excluir o fechamento de ${periodoLabel(selectedPeriodo)}? As metas, premiação e resultados desse período serão perdidos.`
        }
        onConfirm={doDelete}
        onCancel={() => {
          setConfirmDelete(false);
          setDeleteError(null);
        }}
        confirmLabel={deleting ? "Excluindo..." : "Excluir"}
        danger
      />

      <Modal open={newMetaOpen} onClose={() => setNewMetaOpen(false)} title="Nova meta">
        <FormError message={newMetaError} />
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Nome</span>
            <input
              type="text"
              value={newMetaForm.nome}
              onChange={(e) => setNewMetaForm({ ...newMetaForm, nome: e.target.value })}
              placeholder="Ex.: NPS Delivery, Refeições servidas..."
              className="input"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Unidade</span>
              <select
                value={newMetaForm.unidade}
                onChange={(e) => setNewMetaForm({ ...newMetaForm, unidade: e.target.value as GerenteCustomIndicatorDTO["unidade"] })}
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
              <span className="block text-xs text-nord-gray mb-1">Meta é batida quando o valor for</span>
              <select
                value={newMetaForm.direcao}
                onChange={(e) => setNewMetaForm({ ...newMetaForm, direcao: e.target.value as GerenteCustomIndicatorDTO["direcao"] })}
                className="input"
              >
                <option value="MIN">Menor ou igual à meta (ex.: até 5%)</option>
                <option value="MAX">Maior ou igual à meta (ex.: mín. 90%)</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Meta padrão</span>
              <input
                type="number"
                step="0.1"
                value={newMetaForm.metaPadrao}
                onChange={(e) => setNewMetaForm({ ...newMetaForm, metaPadrao: e.target.value })}
                className="input"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Premiação padrão (R$)</span>
              <input
                type="number"
                value={newMetaForm.premiacaoPadrao}
                onChange={(e) => setNewMetaForm({ ...newMetaForm, premiacaoPadrao: e.target.value })}
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

      <ConfirmDialog
        open={deleteMetaTarget !== null}
        title="Excluir meta"
        message={`Tem certeza que quer excluir a meta "${deleteMetaTarget?.nome}"? Isso remove essa meta e o histórico de valores dela em todos os meses — o restante da reunião não é afetado.`}
        confirmLabel={deletingMeta ? "Excluindo..." : "Excluir"}
        danger
        onConfirm={confirmDeleteMeta}
        onCancel={() => setDeleteMetaTarget(null)}
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
                  <th className="py-2 px-3">
                    <span className="flex items-center gap-1.5">
                      <DynamicIcon name="Trophy" size={13} className="text-nord-blue-light" /> Premiação total
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
                    <td className="py-2 px-3 text-amber-400">{formatCurrency(meetingPremiacaoTotal(m))}</td>
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
