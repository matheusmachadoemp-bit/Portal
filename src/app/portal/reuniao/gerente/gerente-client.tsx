"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Trophy, Pencil, FileDown } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { SortableCardGrid } from "@/components/ui/sortable-stat-cards";
import { DynamicIcon } from "@/components/dynamic-icon";
import { IndicatorCard, statusOf } from "@/components/reuniao/indicator-card";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { periodoLabel, periodoShortLabel, previousPeriodo } from "@/lib/reuniao";
import { exportMeetingReportPdf } from "@/lib/reuniao-pdf";

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
  periodo,
  canCreate,
  empresaName,
}: {
  initialMeetings: Meeting[];
  initialCurrent: Meeting | null;
  initialMetrics: Metrics;
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

  const premiacaoTotal = useMemo(() => {
    let total = 0;
    if (bateuFaturamento) total += Number(form.premiacaoFaturamento) || 0;
    if (bateuCmv) total += Number(form.premiacaoCmv) || 0;
    if (bateuTurnover) total += Number(form.premiacaoTurnover) || 0;
    if (bateuChecklist) total += Number(form.premiacaoChecklist) || 0;
    return total;
  }, [bateuFaturamento, bateuCmv, bateuTurnover, bateuChecklist, form]);

  function exportPdf() {
    const periodo1 = previousPeriodo(selectedPeriodo);
    const periodo2 = previousPeriodo(periodo1);
    const anterior1 = meetings.find((m) => m.periodo === periodo1) ?? null;
    const anterior2 = meetings.find((m) => m.periodo === periodo2) ?? null;

    function historico<K extends "faturamentoTotalValor" | "cmvPercent" | "turnoverPercent" | "checklistOperacionalPercent">(
      key: K,
      atualValue: number | null
    ) {
      const points = [
        anterior2 && { monthLabel: periodoShortLabel(anterior2.periodo), value: anterior2[key] },
        anterior1 && { monthLabel: periodoShortLabel(anterior1.periodo), value: anterior1[key] },
      ].filter((p): p is { monthLabel: string; value: number | null } => Boolean(p));
      points.push({ monthLabel: periodoShortLabel(selectedPeriodo), value: atualValue });
      return points;
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
  }

  async function submit() {
    setSaving(true);
    try {
      await fetch("/api/reuniao/gerente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToPayload(selectedPeriodo, form)),
      });
      await refresh(selectedPeriodo);
    } finally {
      setSaving(false);
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
          valueSlot={
            canCreate ? (
              <input
                type="number"
                step="0.1"
                value={form.turnoverPercent}
                onChange={(e) => setForm({ ...form, turnoverPercent: e.target.value })}
                placeholder="%"
                className="input"
              />
            ) : (
              <span className="text-2xl font-semibold text-white">{turnoverValor === null ? "-" : `${turnoverValor}%`}</span>
            )
          }
          metaText={`Meta: até ${formatNumber(turnoverMeta, 1)}%`}
          premio={Number(form.premiacaoTurnover) || 0}
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
          valueSlot={
            canCreate ? (
              <input
                type="number"
                value={form.faltasAtrasosAtestados}
                onChange={(e) => setForm({ ...form, faltasAtrasosAtestados: e.target.value })}
                placeholder="qtd"
                className="input"
              />
            ) : (
              <span className="text-2xl font-semibold text-white">{faltasValor ?? "-"}</span>
            )
          }
          metaText="Indicador informativo"
          premio={0}
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
            canCreate ? (
              <input
                type="number"
                step="0.1"
                value={form.checklistOperacionalPercent}
                onChange={(e) => setForm({ ...form, checklistOperacionalPercent: e.target.value })}
                placeholder="%"
                className="input"
              />
            ) : (
              <span className="text-2xl font-semibold text-white">{checklistValor === null ? "-" : `${checklistValor}%`}</span>
            )
          }
          metaText={`Meta: mín. ${formatNumber(checklistMeta, 1)}%`}
          premio={Number(form.premiacaoChecklist) || 0}
        />
      ),
    },
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
          <button
            onClick={exportPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-nord-border text-nord-gray hover:text-white hover:border-nord-blue-light"
          >
            <FileDown size={13} /> Exportar PDF
          </button>
          {canCreate && (
            <button onClick={() => setShowMetas((s) => !s)} className="text-xs text-nord-blue-light hover:underline">
              {showMetas ? "Ocultar metas e premiação" : "Editar metas e premiação"}
            </button>
          )}
        </div>
      </div>

      <SortableCardGrid
        storageKey="reuniao-gerente-kpi-order"
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4"
        items={cards}
      />

      {premiacaoTotal > 0 && (
        <div className="nord-card p-4 flex items-center gap-3 bg-amber-950/10 border-amber-900/40">
          <Trophy size={20} className="text-amber-400 shrink-0" />
          <span className="text-sm text-white">
            Premiação total do mês: <strong>{formatCurrency(premiacaoTotal)}</strong>
          </span>
        </div>
      )}

      {canCreate && showMetas && (
        <Section title="Metas e premiação do período">
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
        </Section>
      )}

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
