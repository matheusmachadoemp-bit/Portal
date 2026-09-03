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
  npsPercent: number | null;
  faturamentoValor: number | null;
  ticketMedioValor: number | null;
  npsMetaPercent: number;
  faturamentoMetaValor: number;
  ticketMedioMetaValor: number;
  premiacaoNps: number;
  premiacaoFaturamento: number;
  premiacaoTicketMedio: number;
  notas: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { name: string };
};

type Metrics = { npsPercent: number | null; faturamentoValor: number; ticketMedioValor: number | null };

function buildForm(m?: Meeting | null) {
  return {
    npsMetaPercent: String(m?.npsMetaPercent ?? 80),
    faturamentoMetaValor: String(m?.faturamentoMetaValor ?? 0),
    ticketMedioMetaValor: String(m?.ticketMedioMetaValor ?? 0),
    premiacaoNps: String(m?.premiacaoNps ?? 0),
    premiacaoFaturamento: String(m?.premiacaoFaturamento ?? 0),
    premiacaoTicketMedio: String(m?.premiacaoTicketMedio ?? 0),
    notas: m?.notas ?? "",
  };
}

function meetingPremiacaoTotal(m: Meeting) {
  return (
    (m.npsPercent !== null && m.npsPercent >= m.npsMetaPercent ? m.premiacaoNps : 0) +
    (m.faturamentoValor !== null && m.faturamentoValor >= m.faturamentoMetaValor ? m.premiacaoFaturamento : 0) +
    (m.ticketMedioValor !== null && m.ticketMedioValor >= m.ticketMedioMetaValor ? m.premiacaoTicketMedio : 0)
  );
}

export function SalaoClient({
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
    fetch(`/api/reuniao/salao?periodo=${selectedPeriodo}`)
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

  const npsMeta = Number(form.npsMetaPercent) || 0;
  const faturamentoMeta = Number(form.faturamentoMetaValor) || 0;
  const ticketMedioMeta = Number(form.ticketMedioMetaValor) || 0;

  const bateuNps = metrics.npsPercent === null ? null : metrics.npsPercent >= npsMeta;
  const bateuFaturamento = metrics.faturamentoValor >= faturamentoMeta;
  const bateuTicketMedio = metrics.ticketMedioValor === null ? null : metrics.ticketMedioValor >= ticketMedioMeta;

  const premiacaoTotal = useMemo(() => {
    let total = 0;
    if (bateuNps) total += Number(form.premiacaoNps) || 0;
    if (bateuFaturamento) total += Number(form.premiacaoFaturamento) || 0;
    if (bateuTicketMedio) total += Number(form.premiacaoTicketMedio) || 0;
    return total;
  }, [bateuNps, bateuFaturamento, bateuTicketMedio, form]);

  function exportPdf() {
    const periodo1 = previousPeriodo(selectedPeriodo);
    const periodo2 = previousPeriodo(periodo1);
    const anterior1 = meetings.find((m) => m.periodo === periodo1) ?? null;
    const anterior2 = meetings.find((m) => m.periodo === periodo2) ?? null;

    function historico<K extends "npsPercent" | "faturamentoValor" | "ticketMedioValor">(key: K, atualValue: number | null) {
      const points = [
        anterior2 && { monthLabel: periodoShortLabel(anterior2.periodo), value: anterior2[key] },
        anterior1 && { monthLabel: periodoShortLabel(anterior1.periodo), value: anterior1[key] },
      ].filter((p): p is { monthLabel: string; value: number | null } => Boolean(p));
      points.push({ monthLabel: periodoShortLabel(selectedPeriodo), value: atualValue });
      return points;
    }

    exportMeetingReportPdf({
      fileSlug: "reuniao-salao",
      empresaName,
      periodoLabel: periodoLabel(selectedPeriodo),
      premiacaoTotal,
      observacoes: form.notas,
      indicators: [
        {
          key: "nps",
          label: "NPS Geral",
          unit: "percent",
          meta: npsMeta,
          metaDirection: "max",
          status: statusOf(bateuNps),
          premio: bateuNps ? Number(form.premiacaoNps) || 0 : 0,
          historico: historico("npsPercent", metrics.npsPercent),
        },
        {
          key: "faturamento",
          label: "Faturamento do Salão",
          unit: "currency",
          meta: faturamentoMeta,
          metaDirection: "max",
          status: statusOf(bateuFaturamento),
          premio: bateuFaturamento ? Number(form.premiacaoFaturamento) || 0 : 0,
          historico: historico("faturamentoValor", metrics.faturamentoValor),
        },
        {
          key: "ticket-medio",
          label: "Ticket Médio",
          unit: "currency",
          meta: ticketMedioMeta,
          metaDirection: "max",
          status: statusOf(bateuTicketMedio),
          premio: bateuTicketMedio ? Number(form.premiacaoTicketMedio) || 0 : 0,
          historico: historico("ticketMedioValor", metrics.ticketMedioValor),
        },
      ],
    });
  }

  async function refresh(targetPeriodo: string) {
    const res = await fetch(`/api/reuniao/salao?periodo=${targetPeriodo}`);
    const data = await res.json();
    setMeetings(data.meetings);
    setCurrent(data.current);
    setMetrics(data.metrics);
  }

  async function submit() {
    setSaving(true);
    try {
      await fetch("/api/reuniao/salao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodo: selectedPeriodo, ...form }),
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
    setMetrics({ npsPercent: m.npsPercent, faturamentoValor: m.faturamentoValor ?? 0, ticketMedioValor: m.ticketMedioValor });
  }

  const cards = [
    {
      key: "nps",
      content: (
        <IndicatorCard
          icon="Smile"
          color="#1464F4"
          label="NPS Geral"
          status={statusOf(bateuNps)}
          valueSlot={
            <span className="text-2xl font-semibold text-white">
              {metrics.npsPercent === null ? "-" : `${formatNumber(metrics.npsPercent, 1)}%`}
            </span>
          }
          metaText={`Meta: mín. ${formatNumber(npsMeta, 0)}%`}
          premio={Number(form.premiacaoNps) || 0}
        />
      ),
    },
    {
      key: "faturamento",
      content: (
        <IndicatorCard
          icon="TrendingUp"
          color="#22c55e"
          label="Faturamento do Salão"
          status={statusOf(bateuFaturamento)}
          valueSlot={<span className="text-2xl font-semibold text-white">{formatCurrency(metrics.faturamentoValor)}</span>}
          metaText={`Meta: mín. ${formatCurrency(faturamentoMeta)}`}
          premio={Number(form.premiacaoFaturamento) || 0}
        />
      ),
    },
    {
      key: "ticket-medio",
      content: (
        <IndicatorCard
          icon="Receipt"
          color="#f59e0b"
          label="Ticket Médio"
          status={statusOf(bateuTicketMedio)}
          valueSlot={
            <span className="text-2xl font-semibold text-white">
              {metrics.ticketMedioValor === null ? "-" : formatCurrency(metrics.ticketMedioValor)}
            </span>
          }
          metaText={`Meta: mín. ${formatCurrency(ticketMedioMeta)}`}
          premio={Number(form.premiacaoTicketMedio) || 0}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <input type="month" value={selectedPeriodo} onChange={(e) => setSelectedPeriodo(e.target.value)} className="input w-auto" />
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

      <SortableCardGrid storageKey="reuniao-salao-kpi-order" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" items={cards} />

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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Meta NPS (%)</span>
              <input type="number" value={form.npsMetaPercent} onChange={(e) => setForm({ ...form, npsMetaPercent: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Meta Faturamento (R$)</span>
              <input
                type="number"
                value={form.faturamentoMetaValor}
                onChange={(e) => setForm({ ...form, faturamentoMetaValor: e.target.value })}
                className="input"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Meta Ticket Médio (R$)</span>
              <input
                type="number"
                value={form.ticketMedioMetaValor}
                onChange={(e) => setForm({ ...form, ticketMedioMetaValor: e.target.value })}
                className="input"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Premiação NPS (R$)</span>
              <input type="number" value={form.premiacaoNps} onChange={(e) => setForm({ ...form, premiacaoNps: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Premiação Faturamento (R$)</span>
              <input
                type="number"
                value={form.premiacaoFaturamento}
                onChange={(e) => setForm({ ...form, premiacaoFaturamento: e.target.value })}
                className="input"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Premiação Ticket Médio (R$)</span>
              <input
                type="number"
                value={form.premiacaoTicketMedio}
                onChange={(e) => setForm({ ...form, premiacaoTicketMedio: e.target.value })}
                className="input"
              />
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
                      <DynamicIcon name="Smile" size={13} className="text-nord-blue-light" /> NPS
                    </span>
                  </th>
                  <th className="py-2 px-3">
                    <span className="flex items-center gap-1.5">
                      <DynamicIcon name="TrendingUp" size={13} className="text-nord-blue-light" /> Faturamento
                    </span>
                  </th>
                  <th className="py-2 px-3">
                    <span className="flex items-center gap-1.5">
                      <DynamicIcon name="Receipt" size={13} className="text-nord-blue-light" /> Ticket Médio
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
                    <td className="py-2 px-3 text-nord-gray">{m.npsPercent === null ? "-" : `${formatNumber(m.npsPercent, 1)}%`}</td>
                    <td className="py-2 px-3 text-nord-gray">{m.faturamentoValor === null ? "-" : formatCurrency(m.faturamentoValor)}</td>
                    <td className="py-2 px-3 text-nord-gray">{m.ticketMedioValor === null ? "-" : formatCurrency(m.ticketMedioValor)}</td>
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
