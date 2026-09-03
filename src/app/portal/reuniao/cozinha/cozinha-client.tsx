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
  cmvPercent: number | null;
  desperdicioValor: number | null;
  tempoPedidoMinutos: number | null;
  organizacaoPercent: number | null;
  cmvMetaPercent: number;
  desperdicioMetaValor: number;
  tempoPedidoMetaMinutos: number;
  organizacaoMetaPercent: number;
  premiacaoCmv: number;
  premiacaoDesperdicio: number;
  premiacaoTempoPedido: number;
  premiacaoOrganizacao: number;
  notas: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { name: string };
};

type Metrics = { cmvPercent: number | null; desperdicioValor: number; faturamento: number };

function formToPayload(periodo: string, form: ReturnType<typeof buildForm>) {
  return { periodo, ...form };
}

function buildForm(m?: Meeting | null) {
  return {
    tempoPedidoMinutos: m?.tempoPedidoMinutos != null ? String(m.tempoPedidoMinutos) : "",
    organizacaoPercent: m?.organizacaoPercent != null ? String(m.organizacaoPercent) : "",
    cmvMetaPercent: String(m?.cmvMetaPercent ?? 30),
    desperdicioMetaValor: String(m?.desperdicioMetaValor ?? 450),
    tempoPedidoMetaMinutos: String(m?.tempoPedidoMetaMinutos ?? 15),
    organizacaoMetaPercent: String(m?.organizacaoMetaPercent ?? 90),
    premiacaoCmv: String(m?.premiacaoCmv ?? 400),
    premiacaoDesperdicio: String(m?.premiacaoDesperdicio ?? 300),
    premiacaoTempoPedido: String(m?.premiacaoTempoPedido ?? 500),
    premiacaoOrganizacao: String(m?.premiacaoOrganizacao ?? 300),
    notas: m?.notas ?? "",
  };
}

function meetingPremiacaoTotal(m: Meeting) {
  return (
    (m.cmvPercent !== null && m.cmvPercent <= m.cmvMetaPercent ? m.premiacaoCmv : 0) +
    (m.desperdicioValor !== null && m.desperdicioValor <= m.desperdicioMetaValor ? m.premiacaoDesperdicio : 0) +
    (m.tempoPedidoMinutos !== null && m.tempoPedidoMinutos <= m.tempoPedidoMetaMinutos ? m.premiacaoTempoPedido : 0) +
    (m.organizacaoPercent !== null && m.organizacaoPercent >= m.organizacaoMetaPercent ? m.premiacaoOrganizacao : 0)
  );
}

export function CozinhaClient({
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
    fetch(`/api/reuniao/cozinha?periodo=${selectedPeriodo}`)
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

  const cmvMeta = Number(form.cmvMetaPercent) || 0;
  const desperdicioMeta = Number(form.desperdicioMetaValor) || 0;
  const tempoMeta = Number(form.tempoPedidoMetaMinutos) || 0;
  const organizacaoMeta = Number(form.organizacaoMetaPercent) || 0;

  const tempoValor = form.tempoPedidoMinutos ? Number(form.tempoPedidoMinutos) : null;
  const organizacaoValor = form.organizacaoPercent ? Number(form.organizacaoPercent) : null;

  const bateuCmv = metrics.cmvPercent === null ? null : metrics.cmvPercent <= cmvMeta;
  const bateuDesperdicio = metrics.desperdicioValor <= desperdicioMeta;
  const bateuTempo = tempoValor === null ? null : tempoValor <= tempoMeta;
  const bateuOrganizacao = organizacaoValor === null ? null : organizacaoValor >= organizacaoMeta;

  const premiacaoTotal = useMemo(() => {
    let total = 0;
    if (bateuCmv) total += Number(form.premiacaoCmv) || 0;
    if (bateuDesperdicio) total += Number(form.premiacaoDesperdicio) || 0;
    if (bateuTempo) total += Number(form.premiacaoTempoPedido) || 0;
    if (bateuOrganizacao) total += Number(form.premiacaoOrganizacao) || 0;
    return total;
  }, [bateuCmv, bateuDesperdicio, bateuTempo, bateuOrganizacao, form]);

  function exportPdf() {
    const periodo1 = previousPeriodo(selectedPeriodo);
    const periodo2 = previousPeriodo(periodo1);
    const anterior1 = meetings.find((m) => m.periodo === periodo1) ?? null;
    const anterior2 = meetings.find((m) => m.periodo === periodo2) ?? null;

    function historico<K extends "cmvPercent" | "desperdicioValor" | "tempoPedidoMinutos" | "organizacaoPercent">(
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
      fileSlug: "reuniao-cozinha",
      empresaName,
      periodoLabel: periodoLabel(selectedPeriodo),
      premiacaoTotal,
      observacoes: form.notas,
      indicators: [
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
          key: "desperdicio",
          label: "Desperdício",
          unit: "currency",
          meta: desperdicioMeta,
          metaDirection: "min",
          status: statusOf(bateuDesperdicio),
          premio: bateuDesperdicio ? Number(form.premiacaoDesperdicio) || 0 : 0,
          historico: historico("desperdicioValor", metrics.desperdicioValor),
        },
        {
          key: "tempo-pedido",
          label: "Tempo de Pedido",
          unit: "minutes",
          meta: tempoMeta,
          metaDirection: "min",
          status: statusOf(bateuTempo),
          premio: bateuTempo ? Number(form.premiacaoTempoPedido) || 0 : 0,
          historico: historico("tempoPedidoMinutos", tempoValor),
        },
        {
          key: "organizacao",
          label: "Organização e Limpeza",
          unit: "percent",
          meta: organizacaoMeta,
          metaDirection: "max",
          status: statusOf(bateuOrganizacao),
          premio: bateuOrganizacao ? Number(form.premiacaoOrganizacao) || 0 : 0,
          historico: historico("organizacaoPercent", organizacaoValor),
        },
      ],
    });
  }

  async function refresh(targetPeriodo: string) {
    const res = await fetch(`/api/reuniao/cozinha?periodo=${targetPeriodo}`);
    const data = await res.json();
    setMeetings(data.meetings);
    setCurrent(data.current);
    setMetrics(data.metrics);
  }

  async function submit() {
    setSaving(true);
    try {
      await fetch("/api/reuniao/cozinha", {
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
    setMetrics({ cmvPercent: m.cmvPercent, desperdicioValor: m.desperdicioValor ?? 0, faturamento: 0 });
  }

  const cards = [
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
      key: "desperdicio",
      content: (
        <IndicatorCard
          icon="Trash2"
          color="#ef4444"
          label="Desperdício"
          status={statusOf(bateuDesperdicio)}
          valueSlot={<span className="text-2xl font-semibold text-white">{formatCurrency(metrics.desperdicioValor)}</span>}
          metaText={`Meta: até ${formatCurrency(desperdicioMeta)}`}
          premio={Number(form.premiacaoDesperdicio) || 0}
        />
      ),
    },
    {
      key: "tempo-pedido",
      content: (
        <IndicatorCard
          icon="Clock"
          color="#a855f7"
          label="Tempo Pedido"
          status={statusOf(bateuTempo)}
          valueSlot={
            canCreate ? (
              <input
                type="number"
                value={form.tempoPedidoMinutos}
                onChange={(e) => setForm({ ...form, tempoPedidoMinutos: e.target.value })}
                placeholder="minutos"
                className="input"
              />
            ) : (
              <span className="text-2xl font-semibold text-white">{tempoValor ?? "-"} min</span>
            )
          }
          metaText={`Meta: até ${formatNumber(tempoMeta, 0)} min`}
          premio={Number(form.premiacaoTempoPedido) || 0}
        />
      ),
    },
    {
      key: "organizacao",
      content: (
        <IndicatorCard
          icon="Sparkles"
          color="#14b8a6"
          label="Organização"
          status={statusOf(bateuOrganizacao)}
          valueSlot={
            canCreate ? (
              <input
                type="number"
                value={form.organizacaoPercent}
                onChange={(e) => setForm({ ...form, organizacaoPercent: e.target.value })}
                placeholder="%"
                className="input"
              />
            ) : (
              <span className="text-2xl font-semibold text-white">{organizacaoValor ?? "-"}%</span>
            )
          }
          metaText={`Meta: mín. ${formatNumber(organizacaoMeta, 0)}%`}
          premio={Number(form.premiacaoOrganizacao) || 0}
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
        storageKey="reuniao-cozinha-kpi-order"
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
              <span className="block text-xs text-nord-gray mb-1">Meta CMV (%)</span>
              <input type="number" value={form.cmvMetaPercent} onChange={(e) => setForm({ ...form, cmvMetaPercent: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Meta Desperdício (R$)</span>
              <input type="number" value={form.desperdicioMetaValor} onChange={(e) => setForm({ ...form, desperdicioMetaValor: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Meta Tempo Pedido (min)</span>
              <input type="number" value={form.tempoPedidoMetaMinutos} onChange={(e) => setForm({ ...form, tempoPedidoMetaMinutos: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Meta Organização (%)</span>
              <input type="number" value={form.organizacaoMetaPercent} onChange={(e) => setForm({ ...form, organizacaoMetaPercent: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Premiação CMV (R$)</span>
              <input type="number" value={form.premiacaoCmv} onChange={(e) => setForm({ ...form, premiacaoCmv: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Premiação Desperdício (R$)</span>
              <input type="number" value={form.premiacaoDesperdicio} onChange={(e) => setForm({ ...form, premiacaoDesperdicio: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Premiação Tempo Pedido (R$)</span>
              <input type="number" value={form.premiacaoTempoPedido} onChange={(e) => setForm({ ...form, premiacaoTempoPedido: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="block text-xs text-nord-gray mb-1">Premiação Organização (R$)</span>
              <input type="number" value={form.premiacaoOrganizacao} onChange={(e) => setForm({ ...form, premiacaoOrganizacao: e.target.value })} className="input" />
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
                      <DynamicIcon name="Percent" size={13} className="text-nord-blue-light" /> CMV
                    </span>
                  </th>
                  <th className="py-2 px-3">
                    <span className="flex items-center gap-1.5">
                      <DynamicIcon name="Trash2" size={13} className="text-nord-blue-light" /> Desperdício
                    </span>
                  </th>
                  <th className="py-2 px-3">
                    <span className="flex items-center gap-1.5">
                      <DynamicIcon name="Clock" size={13} className="text-nord-blue-light" /> Tempo Pedido
                    </span>
                  </th>
                  <th className="py-2 px-3">
                    <span className="flex items-center gap-1.5">
                      <DynamicIcon name="Sparkles" size={13} className="text-nord-blue-light" /> Organização
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
                    <td className="py-2 px-3 text-nord-gray">{m.cmvPercent === null ? "-" : `${formatNumber(m.cmvPercent, 1)}%`}</td>
                    <td className="py-2 px-3 text-nord-gray">{m.desperdicioValor === null ? "-" : formatCurrency(m.desperdicioValor)}</td>
                    <td className="py-2 px-3 text-nord-gray">{m.tempoPedidoMinutos === null ? "-" : `${m.tempoPedidoMinutos} min`}</td>
                    <td className="py-2 px-3 text-nord-gray">{m.organizacaoPercent === null ? "-" : `${m.organizacaoPercent}%`}</td>
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
