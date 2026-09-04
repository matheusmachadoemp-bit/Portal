"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Trophy, Pencil, FileDown } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { SortableCardGrid } from "@/components/ui/sortable-stat-cards";
import { DynamicIcon } from "@/components/dynamic-icon";
import { IndicatorCard, statusOf } from "@/components/reuniao/indicator-card";
import { CompareMonthsPicker } from "@/components/reuniao/compare-months";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { compareToPrevious, periodoLabel, periodoShortLabel, previousPeriodo, resolveComparePeriodos } from "@/lib/reuniao";
import { exportMeetingReportPdf } from "@/lib/reuniao-pdf";

type Meeting = {
  id: string;
  periodo: string;
  cancelamentoPercent: number | null;
  avaliacaoNota: number | null;
  tempoEntregaMinutos: number | null;
  chamadosPercent: number | null;
  cancelamentoMetaPercent: number;
  avaliacaoMetaNota: number;
  tempoEntregaMetaMinutos: number;
  chamadosMetaPercent: number;
  premiacaoCancelamento: number;
  premiacaoAvaliacao: number;
  premiacaoTempoEntrega: number;
  premiacaoChamados: number;
  notas: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { name: string };
};

type Metrics = { cancelamentoPercent: number | null };

function formToPayload(periodo: string, form: ReturnType<typeof buildForm>) {
  return { periodo, ...form };
}

function buildForm(m?: Meeting | null) {
  return {
    avaliacaoNota: m?.avaliacaoNota != null ? String(m.avaliacaoNota) : "",
    tempoEntregaMinutos: m?.tempoEntregaMinutos != null ? String(m.tempoEntregaMinutos) : "",
    chamadosPercent: m?.chamadosPercent != null ? String(m.chamadosPercent) : "",
    cancelamentoMetaPercent: String(m?.cancelamentoMetaPercent ?? 1),
    avaliacaoMetaNota: String(m?.avaliacaoMetaNota ?? 4.7),
    tempoEntregaMetaMinutos: String(m?.tempoEntregaMetaMinutos ?? 40),
    chamadosMetaPercent: String(m?.chamadosMetaPercent ?? 2.5),
    premiacaoCancelamento: String(m?.premiacaoCancelamento ?? 50),
    premiacaoAvaliacao: String(m?.premiacaoAvaliacao ?? 50),
    premiacaoTempoEntrega: String(m?.premiacaoTempoEntrega ?? 50),
    premiacaoChamados: String(m?.premiacaoChamados ?? 50),
    notas: m?.notas ?? "",
  };
}

function meetingPremiacaoTotal(m: Meeting) {
  return (
    (m.cancelamentoPercent !== null && m.cancelamentoPercent <= m.cancelamentoMetaPercent ? m.premiacaoCancelamento : 0) +
    (m.avaliacaoNota !== null && m.avaliacaoNota >= m.avaliacaoMetaNota ? m.premiacaoAvaliacao : 0) +
    (m.tempoEntregaMinutos !== null && m.tempoEntregaMinutos <= m.tempoEntregaMetaMinutos ? m.premiacaoTempoEntrega : 0) +
    (m.chamadosPercent !== null && m.chamadosPercent <= m.chamadosMetaPercent ? m.premiacaoChamados : 0)
  );
}

export function DeliveryClient({
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
  const [comparePeriodos, setComparePeriodos] = useState<[string, string, string]>(["", "", ""]);

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/reuniao/delivery?periodo=${selectedPeriodo}`)
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

  const cancelamentoMeta = Number(form.cancelamentoMetaPercent) || 0;
  const avaliacaoMeta = Number(form.avaliacaoMetaNota) || 0;
  const tempoEntregaMeta = Number(form.tempoEntregaMetaMinutos) || 0;
  const chamadosMeta = Number(form.chamadosMetaPercent) || 0;

  const avaliacaoValor = form.avaliacaoNota ? Number(form.avaliacaoNota) : null;
  const tempoEntregaValor = form.tempoEntregaMinutos ? Number(form.tempoEntregaMinutos) : null;
  const chamadosValor = form.chamadosPercent ? Number(form.chamadosPercent) : null;

  const bateuCancelamento = metrics.cancelamentoPercent === null ? null : metrics.cancelamentoPercent <= cancelamentoMeta;
  const bateuAvaliacao = avaliacaoValor === null ? null : avaliacaoValor >= avaliacaoMeta;
  const bateuTempoEntrega = tempoEntregaValor === null ? null : tempoEntregaValor <= tempoEntregaMeta;
  const bateuChamados = chamadosValor === null ? null : chamadosValor <= chamadosMeta;

  const previousMeeting = useMemo(
    () => meetings.find((m) => m.periodo === previousPeriodo(selectedPeriodo)) ?? null,
    [meetings, selectedPeriodo]
  );
  const compCancelamento = compareToPrevious(metrics.cancelamentoPercent, previousMeeting?.cancelamentoPercent, "min");
  const compAvaliacao = compareToPrevious(avaliacaoValor, previousMeeting?.avaliacaoNota, "max");
  const compTempoEntrega = compareToPrevious(tempoEntregaValor, previousMeeting?.tempoEntregaMinutos, "min");
  const compChamados = compareToPrevious(chamadosValor, previousMeeting?.chamadosPercent, "min");

  const premiacaoTotal = useMemo(() => {
    let total = 0;
    if (bateuCancelamento) total += Number(form.premiacaoCancelamento) || 0;
    if (bateuAvaliacao) total += Number(form.premiacaoAvaliacao) || 0;
    if (bateuTempoEntrega) total += Number(form.premiacaoTempoEntrega) || 0;
    if (bateuChamados) total += Number(form.premiacaoChamados) || 0;
    return total;
  }, [bateuCancelamento, bateuAvaliacao, bateuTempoEntrega, bateuChamados, form]);

  function exportPdf() {
    const periodosComparados = resolveComparePeriodos(selectedPeriodo, comparePeriodos);

    function historico<K extends "cancelamentoPercent" | "avaliacaoNota" | "tempoEntregaMinutos" | "chamadosPercent">(
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
      fileSlug: "reuniao-delivery",
      empresaName,
      periodoLabel: periodoLabel(selectedPeriodo),
      premiacaoTotal,
      observacoes: form.notas,
      indicators: [
        {
          key: "cancelamento",
          label: "Cancelamento",
          unit: "percent",
          meta: cancelamentoMeta,
          metaDirection: "min",
          status: statusOf(bateuCancelamento),
          premio: bateuCancelamento ? Number(form.premiacaoCancelamento) || 0 : 0,
          historico: historico("cancelamentoPercent", metrics.cancelamentoPercent),
        },
        {
          key: "avaliacao",
          label: "Avaliações (iFood)",
          unit: "rating",
          meta: avaliacaoMeta,
          metaDirection: "max",
          status: statusOf(bateuAvaliacao),
          premio: bateuAvaliacao ? Number(form.premiacaoAvaliacao) || 0 : 0,
          historico: historico("avaliacaoNota", avaliacaoValor),
        },
        {
          key: "tempo-entrega",
          label: "Tempo de Entrega",
          unit: "minutes",
          meta: tempoEntregaMeta,
          metaDirection: "min",
          status: statusOf(bateuTempoEntrega),
          premio: bateuTempoEntrega ? Number(form.premiacaoTempoEntrega) || 0 : 0,
          historico: historico("tempoEntregaMinutos", tempoEntregaValor),
        },
        {
          key: "chamados",
          label: "Chamados",
          unit: "percent",
          meta: chamadosMeta,
          metaDirection: "min",
          status: statusOf(bateuChamados),
          premio: bateuChamados ? Number(form.premiacaoChamados) || 0 : 0,
          historico: historico("chamadosPercent", chamadosValor),
        },
      ],
    });
  }

  async function refresh(targetPeriodo: string) {
    const res = await fetch(`/api/reuniao/delivery?periodo=${targetPeriodo}`);
    const data = await res.json();
    setMeetings(data.meetings);
    setCurrent(data.current);
    setMetrics(data.metrics);
  }

  async function submit() {
    setSaving(true);
    try {
      await fetch("/api/reuniao/delivery", {
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
    setMetrics({ cancelamentoPercent: m.cancelamentoPercent });
  }

  const cards = [
    {
      key: "cancelamento",
      content: (
        <IndicatorCard
          icon="XCircle"
          color="#ef4444"
          label="Cancelamento"
          status={statusOf(bateuCancelamento)}
          valueSlot={
            <span className="text-2xl font-semibold text-white">
              {metrics.cancelamentoPercent === null ? "-" : `${formatNumber(metrics.cancelamentoPercent, 1)}%`}
            </span>
          }
          metaText={`Meta: até ${formatNumber(cancelamentoMeta, 1)}%`}
          premio={Number(form.premiacaoCancelamento) || 0}
          comparison={compCancelamento}
        />
      ),
    },
    {
      key: "avaliacao",
      content: (
        <IndicatorCard
          icon="Star"
          color="#f59e0b"
          label="Avaliações (iFood)"
          status={statusOf(bateuAvaliacao)}
          valueSlot={
            canCreate ? (
              <input
                type="number"
                step="0.1"
                value={form.avaliacaoNota}
                onChange={(e) => setForm({ ...form, avaliacaoNota: e.target.value })}
                placeholder="nota"
                className="input"
              />
            ) : (
              <span className="text-2xl font-semibold text-white">{avaliacaoValor ?? "-"}</span>
            )
          }
          metaText={`Meta: mín. ${formatNumber(avaliacaoMeta, 1)}`}
          premio={Number(form.premiacaoAvaliacao) || 0}
          comparison={compAvaliacao}
        />
      ),
    },
    {
      key: "tempo-entrega",
      content: (
        <IndicatorCard
          icon="Truck"
          color="#1464F4"
          label="Tempo de Entrega"
          status={statusOf(bateuTempoEntrega)}
          valueSlot={
            canCreate ? (
              <input
                type="number"
                value={form.tempoEntregaMinutos}
                onChange={(e) => setForm({ ...form, tempoEntregaMinutos: e.target.value })}
                placeholder="minutos"
                className="input"
              />
            ) : (
              <span className="text-2xl font-semibold text-white">{tempoEntregaValor ?? "-"} min</span>
            )
          }
          metaText={`Meta: até ${formatNumber(tempoEntregaMeta, 0)} min`}
          premio={Number(form.premiacaoTempoEntrega) || 0}
          comparison={compTempoEntrega}
        />
      ),
    },
    {
      key: "chamados",
      content: (
        <IndicatorCard
          icon="PhoneCall"
          color="#a855f7"
          label="Chamados"
          status={statusOf(bateuChamados)}
          valueSlot={
            canCreate ? (
              <input
                type="number"
                value={form.chamadosPercent}
                onChange={(e) => setForm({ ...form, chamadosPercent: e.target.value })}
                placeholder="%"
                className="input"
              />
            ) : (
              <span className="text-2xl font-semibold text-white">{chamadosValor === null ? "-" : `${chamadosValor}%`}</span>
            )
          }
          metaText={`Meta: até ${formatNumber(chamadosMeta, 1)}%`}
          premio={Number(form.premiacaoChamados) || 0}
          comparison={compChamados}
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
          <CompareMonthsPicker periodos={comparePeriodos} onChange={setComparePeriodos} />
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
        storageKey="reuniao-delivery-kpi-order"
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
              <span className="block text-xs text-nord-gray mb-1">Meta Cancelamento (%)</span>
              <input type="number" value={form.cancelamentoMetaPercent} onChange={(e) => setForm({ ...form, cancelamentoMetaPercent: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Meta Avaliações</span>
              <input type="number" step="0.1" value={form.avaliacaoMetaNota} onChange={(e) => setForm({ ...form, avaliacaoMetaNota: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Meta Tempo de Entrega (min)</span>
              <input type="number" value={form.tempoEntregaMetaMinutos} onChange={(e) => setForm({ ...form, tempoEntregaMetaMinutos: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Meta Chamados (%)</span>
              <input type="number" value={form.chamadosMetaPercent} onChange={(e) => setForm({ ...form, chamadosMetaPercent: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Premiação Cancelamento (R$)</span>
              <input type="number" value={form.premiacaoCancelamento} onChange={(e) => setForm({ ...form, premiacaoCancelamento: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Premiação Avaliações (R$)</span>
              <input type="number" value={form.premiacaoAvaliacao} onChange={(e) => setForm({ ...form, premiacaoAvaliacao: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Premiação Tempo de Entrega (R$)</span>
              <input type="number" value={form.premiacaoTempoEntrega} onChange={(e) => setForm({ ...form, premiacaoTempoEntrega: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Premiação Chamados (R$)</span>
              <input type="number" value={form.premiacaoChamados} onChange={(e) => setForm({ ...form, premiacaoChamados: e.target.value })} className="input" />
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
                      <DynamicIcon name="XCircle" size={13} className="text-nord-blue-light" /> Cancelamento
                    </span>
                  </th>
                  <th className="py-2 px-3">
                    <span className="flex items-center gap-1.5">
                      <DynamicIcon name="Star" size={13} className="text-nord-blue-light" /> Avaliações
                    </span>
                  </th>
                  <th className="py-2 px-3">
                    <span className="flex items-center gap-1.5">
                      <DynamicIcon name="Truck" size={13} className="text-nord-blue-light" /> Tempo de Entrega
                    </span>
                  </th>
                  <th className="py-2 px-3">
                    <span className="flex items-center gap-1.5">
                      <DynamicIcon name="PhoneCall" size={13} className="text-nord-blue-light" /> Chamados
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
                    <td className="py-2 px-3 text-nord-gray">{m.cancelamentoPercent === null ? "-" : `${formatNumber(m.cancelamentoPercent, 1)}%`}</td>
                    <td className="py-2 px-3 text-nord-gray">{m.avaliacaoNota === null ? "-" : m.avaliacaoNota}</td>
                    <td className="py-2 px-3 text-nord-gray">{m.tempoEntregaMinutos === null ? "-" : `${m.tempoEntregaMinutos} min`}</td>
                    <td className="py-2 px-3 text-nord-gray">{m.chamadosPercent === null ? "-" : `${m.chamadosPercent}%`}</td>
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
