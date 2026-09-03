"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Trophy, Pencil, FileDown, Star, Quote } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { SortableCardGrid } from "@/components/ui/sortable-stat-cards";
import { DynamicIcon } from "@/components/dynamic-icon";
import { IndicatorCard, statusOf } from "@/components/reuniao/indicator-card";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { compareToPrevious, periodoLabel, periodoShortLabel, previousPeriodo, SALAO_PRODUTOS_PADRAO } from "@/lib/reuniao";
import { exportMeetingReportPdf } from "@/lib/reuniao-pdf";

type ProdutoMeta = { produto: string; quantidade: number | null; meta: number; premiacao: number };

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
  melhorVendedorNome: string | null;
  melhorVendedorValor: number | null;
  npsQualidadeProduto: number | null;
  npsAtendimento: number | null;
  npsAmbiente: number | null;
  npsRodizio: number | null;
  npsTempoEspera: number | null;
  notas: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { name: string };
  produtoMetas: ProdutoMeta[];
};

type Metrics = { npsPercent: number | null; faturamentoValor: number; ticketMedioValor: number | null };
type MelhorVendedor = { nome: string | null; valor: number | null };
type Comentario = { nome: string; comentario: string; nota: number };

const NPS_DETALHADO_FIELDS = [
  { key: "npsQualidadeProduto", label: "Qualidade do Produto" },
  { key: "npsAtendimento", label: "Atendimento" },
  { key: "npsAmbiente", label: "Ambiente" },
  { key: "npsRodizio", label: "Rodízio" },
  { key: "npsTempoEspera", label: "Tempo de Espera" },
] as const;

function buildForm(m?: Meeting | null) {
  return {
    npsMetaPercent: String(m?.npsMetaPercent ?? 80),
    faturamentoMetaValor: String(m?.faturamentoMetaValor ?? 0),
    ticketMedioMetaValor: String(m?.ticketMedioMetaValor ?? 0),
    premiacaoNps: String(m?.premiacaoNps ?? 0),
    premiacaoFaturamento: String(m?.premiacaoFaturamento ?? 0),
    premiacaoTicketMedio: String(m?.premiacaoTicketMedio ?? 0),
    npsQualidadeProduto: m?.npsQualidadeProduto != null ? String(m.npsQualidadeProduto) : "",
    npsAtendimento: m?.npsAtendimento != null ? String(m.npsAtendimento) : "",
    npsAmbiente: m?.npsAmbiente != null ? String(m.npsAmbiente) : "",
    npsRodizio: m?.npsRodizio != null ? String(m.npsRodizio) : "",
    npsTempoEspera: m?.npsTempoEspera != null ? String(m.npsTempoEspera) : "",
    notas: m?.notas ?? "",
  };
}

function buildProdutoForm(m?: Meeting | null) {
  const byProduto = new Map((m?.produtoMetas ?? []).map((p) => [p.produto, p]));
  return SALAO_PRODUTOS_PADRAO.map((produto) => {
    const existing = byProduto.get(produto);
    return {
      produto,
      quantidade: existing?.quantidade != null ? String(existing.quantidade) : "",
      meta: String(existing?.meta ?? 0),
      premiacao: String(existing?.premiacao ?? 0),
    };
  });
}

function meetingPremiacaoTotal(m: Meeting) {
  const principais =
    (m.npsPercent !== null && m.npsPercent >= m.npsMetaPercent ? m.premiacaoNps : 0) +
    (m.faturamentoValor !== null && m.faturamentoValor >= m.faturamentoMetaValor ? m.premiacaoFaturamento : 0) +
    (m.ticketMedioValor !== null && m.ticketMedioValor >= m.ticketMedioMetaValor ? m.premiacaoTicketMedio : 0);
  const produtos = m.produtoMetas.reduce(
    (sum, p) => sum + (p.quantidade !== null && p.meta > 0 && p.quantidade >= p.meta ? p.premiacao : 0),
    0
  );
  return principais + produtos;
}

export function SalaoClient({
  initialMeetings,
  initialCurrent,
  initialMetrics,
  initialMelhorVendedor,
  initialComentarios,
  periodo,
  canCreate,
  empresaName,
}: {
  initialMeetings: Meeting[];
  initialCurrent: Meeting | null;
  initialMetrics: Metrics;
  initialMelhorVendedor: MelhorVendedor;
  initialComentarios: Comentario[];
  periodo: string;
  canCreate: boolean;
  empresaName: string;
}) {
  const [meetings, setMeetings] = useState(initialMeetings);
  const [selectedPeriodo, setSelectedPeriodo] = useState(periodo);
  const [current, setCurrent] = useState(initialCurrent);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [melhorVendedor, setMelhorVendedor] = useState(initialMelhorVendedor);
  const [comentarios, setComentarios] = useState(initialComentarios);
  const [form, setForm] = useState(buildForm(initialCurrent));
  const [produtoForm, setProdutoForm] = useState(buildProdutoForm(initialCurrent));
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
        setMelhorVendedor(data.melhorVendedor);
        setComentarios(data.comentarios);
        setForm(buildForm(data.current));
        setProdutoForm(buildProdutoForm(data.current));
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
    for (const p of produtoForm) {
      const qtd = p.quantidade === "" ? null : Number(p.quantidade);
      const metaValor = Number(p.meta) || 0;
      if (qtd !== null && metaValor > 0 && qtd >= metaValor) total += Number(p.premiacao) || 0;
    }
    return total;
  }, [bateuNps, bateuFaturamento, bateuTicketMedio, form, produtoForm]);

  function anteriorMeeting() {
    return meetings.find((m) => m.periodo === previousPeriodo(selectedPeriodo)) ?? null;
  }

  const anteriorParaComparacao = anteriorMeeting();
  const compNps = compareToPrevious(metrics.npsPercent, anteriorParaComparacao?.npsPercent, "max");
  const compFaturamento = compareToPrevious(metrics.faturamentoValor, anteriorParaComparacao?.faturamentoValor, "max");
  const compTicketMedio = compareToPrevious(metrics.ticketMedioValor, anteriorParaComparacao?.ticketMedioValor, "max");

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
        ...produtoForm.map((p) => {
          const qtd = p.quantidade === "" ? null : Number(p.quantidade);
          const meta = Number(p.meta) || 0;
          const bateu = qtd === null || meta <= 0 ? null : qtd >= meta;
          const anteriorProduto = anterior1?.produtoMetas.find((x) => x.produto === p.produto) ?? null;
          const anterior2Produto = anterior2?.produtoMetas.find((x) => x.produto === p.produto) ?? null;
          const pontos = [
            anterior2Produto && { monthLabel: periodoShortLabel(anterior2!.periodo), value: anterior2Produto.quantidade },
            anteriorProduto && { monthLabel: periodoShortLabel(anterior1!.periodo), value: anteriorProduto.quantidade },
          ].filter((x): x is { monthLabel: string; value: number | null } => Boolean(x));
          pontos.push({ monthLabel: periodoShortLabel(selectedPeriodo), value: qtd });
          return {
            key: `produto-${p.produto}`,
            label: `Meta: ${p.produto}`,
            unit: "quantity" as const,
            meta,
            metaDirection: "max" as const,
            status: statusOf(bateu),
            premio: bateu ? Number(p.premiacao) || 0 : 0,
            historico: pontos,
          };
        }),
      ],
    });
  }

  async function refresh(targetPeriodo: string) {
    const res = await fetch(`/api/reuniao/salao?periodo=${targetPeriodo}`);
    const data = await res.json();
    setMeetings(data.meetings);
    setCurrent(data.current);
    setMetrics(data.metrics);
    setMelhorVendedor(data.melhorVendedor);
    setComentarios(data.comentarios);
  }

  async function submit() {
    setSaving(true);
    try {
      await fetch("/api/reuniao/salao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodo: selectedPeriodo, ...form, produtoMetas: produtoForm }),
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
    setProdutoForm(buildProdutoForm(m));
    setMetrics({ npsPercent: m.npsPercent, faturamentoValor: m.faturamentoValor ?? 0, ticketMedioValor: m.ticketMedioValor });
    setMelhorVendedor({ nome: m.melhorVendedorNome, valor: m.melhorVendedorValor });
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
          comparison={compNps}
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
          comparison={compFaturamento}
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
          comparison={compTicketMedio}
        />
      ),
    },
  ];

  const anterior = anteriorParaComparacao;

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

      <Section title="Melhor vendedor do mês">
        {melhorVendedor.nome ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
              <Star size={20} className="text-amber-400" />
            </div>
            <div>
              <p className="text-white font-medium">{melhorVendedor.nome}</p>
              <p className="text-xs text-nord-gray">{formatCurrency(melhorVendedor.valor ?? 0)} em vendas no período</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-nord-gray">Nenhuma venda por garçom registrada nesse período.</p>
        )}
      </Section>

      <Section title="Metas de vendas por produto">
        <div className="overflow-x-auto nord-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-white border-b border-nord-border">
                <th className="py-2 px-3">Produto</th>
                <th className="py-2 px-3">Quantidade</th>
                <th className="py-2 px-3">Meta</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">Premiação (R$)</th>
              </tr>
            </thead>
            <tbody>
              {produtoForm.map((p, i) => {
                const qtd = p.quantidade === "" ? null : Number(p.quantidade);
                const metaValor = Number(p.meta) || 0;
                const bateu = qtd === null || metaValor <= 0 ? null : qtd >= metaValor;
                return (
                  <tr key={p.produto} className="border-b border-nord-border/50">
                    <td className="py-2 px-3 text-white">{p.produto}</td>
                    <td className="py-2 px-3">
                      {canCreate ? (
                        <input
                          type="number"
                          value={p.quantidade}
                          onChange={(e) =>
                            setProdutoForm((prev) => prev.map((x, idx) => (idx === i ? { ...x, quantidade: e.target.value } : x)))
                          }
                          className="input"
                          placeholder="un."
                        />
                      ) : (
                        <span className="text-nord-gray">{qtd ?? "-"}</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      {canCreate && showMetas ? (
                        <input
                          type="number"
                          value={p.meta}
                          onChange={(e) => setProdutoForm((prev) => prev.map((x, idx) => (idx === i ? { ...x, meta: e.target.value } : x)))}
                          className="input"
                        />
                      ) : (
                        <span className="text-nord-gray">{formatNumber(Number(p.meta) || 0, 0)} un.</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <Badge tone={bateu === null ? "default" : bateu ? "success" : "warning"}>
                        {bateu === null ? "Sem dado" : bateu ? "Meta batida" : "Abaixo da meta"}
                      </Badge>
                    </td>
                    <td className="py-2 px-3">
                      {canCreate && showMetas ? (
                        <input
                          type="number"
                          value={p.premiacao}
                          onChange={(e) =>
                            setProdutoForm((prev) => prev.map((x, idx) => (idx === i ? { ...x, premiacao: e.target.value } : x)))
                          }
                          className="input"
                        />
                      ) : (
                        <span className="text-amber-400">{formatCurrency(Number(p.premiacao) || 0)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="NPS detalhado por categoria">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {NPS_DETALHADO_FIELDS.map((f) => (
            <div key={f.key} className="nord-card p-3 flex flex-col gap-1.5">
              <span className="text-xs text-nord-gray">{f.label}</span>
              {canCreate ? (
                <input
                  type="number"
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className="input"
                  placeholder="nota"
                />
              ) : (
                <span className="text-lg font-semibold text-white">{form[f.key] || "-"}</span>
              )}
              <span className="text-[11px] text-nord-gray">
                Mês anterior: {anterior?.[f.key] != null ? anterior[f.key] : "-"}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {comentarios.length > 0 && (
        <Section title="Comentários de clientes em destaque">
          <div className="space-y-3">
            {comentarios.map((c, i) => (
              <div key={i} className="flex gap-2 text-sm">
                <Quote size={14} className="text-nord-blue-light shrink-0 mt-0.5" />
                <div>
                  <p className="text-white italic">&ldquo;{c.comentario}&rdquo;</p>
                  <p className="text-xs text-nord-gray">
                    {c.nome} · nota {c.nota}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {canCreate && showMetas && (
        <Section title="Metas e premiação — NPS, Faturamento e Ticket Médio">
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
          <p className="text-xs text-nord-gray mt-3">
            As metas e premiações de cada produto ficam editáveis direto na tabela de &ldquo;Metas de vendas por produto&rdquo; acima.
          </p>
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
