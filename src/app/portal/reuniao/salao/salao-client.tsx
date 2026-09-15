"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Trophy, Pencil, FileDown, Star, Quote, Trash2 } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { SortableCardGrid } from "@/components/ui/sortable-stat-cards";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { DynamicIcon } from "@/components/dynamic-icon";
import { IndicatorCard, statusOf } from "@/components/reuniao/indicator-card";
import { CompareMonthsPicker } from "@/components/reuniao/compare-months";
import {
  FechamentoDoMesSection,
  FechamentoDoMesEditor,
  useFechamentoDoMes,
  customIndicatorCards,
  type FechamentoIndicator,
} from "@/components/reuniao/fechamento-do-mes";
import { formatCurrency, formatNumber } from "@/lib/calc";
import {
  compareToPrevious,
  periodoLabel,
  periodoShortLabel,
  previousPeriodo,
  resolveComparePeriodos,
  SALAO_PRODUTOS_PADRAO,
} from "@/lib/reuniao";

type ProdutoMeta = { produto: string; quantidade: number | null; meta: number; premiacao: number };

type Meeting = {
  id: string;
  periodo: string;
  npsPercent: number | null;
  faturamentoValor: number | null;
  ticketMedioValor: number | null;
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

/** Premiação total do mês — hoje só depende das metas de venda por produto
 * (SalaoProductGoal, meta+premiação por produto), mecanismo à parte que não
 * mudou. NPS Geral, Faturamento do Salão e Ticket Médio deixaram de ter
 * meta/premiação própria (viraram indicadores informativos, ver cards
 * abaixo), então não entram mais nessa soma. */
function meetingPremiacaoTotal(m: Meeting) {
  return m.produtoMetas.reduce(
    (sum, p) => sum + (p.quantidade !== null && p.meta > 0 && p.quantidade >= p.meta ? p.premiacao : 0),
    0
  );
}

export function SalaoClient({
  initialMeetings,
  initialCurrent,
  initialMetrics,
  initialMelhorVendedor,
  initialComentarios,
  initialCustomIndicators,
  periodo,
  canCreate,
  empresaName,
}: {
  initialMeetings: Meeting[];
  initialCurrent: Meeting | null;
  initialMetrics: Metrics;
  initialMelhorVendedor: MelhorVendedor;
  initialComentarios: Comentario[];
  initialCustomIndicators: FechamentoIndicator[];
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
  const [fechamentoModalOpen, setFechamentoModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [comparePeriodos, setComparePeriodos] = useState<[string, string, string]>(["", "", ""]);

  const fdm = useFechamentoDoMes("/api/reuniao/salao", selectedPeriodo, initialCustomIndicators);

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    let cancelled = false;
    const fdmToken = fdm.beginFetch();
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
        fdm.sync(fdmToken, data.customIndicators ?? []);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fdm.sync só chama setState estáveis por baixo (ver useFechamentoDoMes); incluir `fdm` recriaria o efeito a cada render (objeto novo) e causaria um loop de fetch.
  }, [selectedPeriodo]);

  const premiacaoTotal = useMemo(() => {
    let total = 0;
    for (const p of produtoForm) {
      const qtd = p.quantidade === "" ? null : Number(p.quantidade);
      const metaValor = Number(p.meta) || 0;
      if (qtd !== null && metaValor > 0 && qtd >= metaValor) total += Number(p.premiacao) || 0;
    }
    return total;
  }, [produtoForm]);

  function anteriorMeeting() {
    return meetings.find((m) => m.periodo === previousPeriodo(selectedPeriodo)) ?? null;
  }

  const anteriorParaComparacao = anteriorMeeting();
  const compNps = compareToPrevious(metrics.npsPercent, anteriorParaComparacao?.npsPercent, "max");
  const compFaturamento = compareToPrevious(metrics.faturamentoValor, anteriorParaComparacao?.faturamentoValor, "max");
  const compTicketMedio = compareToPrevious(metrics.ticketMedioValor, anteriorParaComparacao?.ticketMedioValor, "max");

  async function exportPdf() {
    const { exportMeetingReportPdf } = await import("@/lib/reuniao-pdf");
    const periodosComparados = resolveComparePeriodos(selectedPeriodo, comparePeriodos);

    function historico<K extends "npsPercent" | "faturamentoValor" | "ticketMedioValor">(key: K, atualValue: number | null) {
      return periodosComparados.map((p) => {
        if (p === selectedPeriodo) return { monthLabel: periodoShortLabel(p), value: atualValue };
        const m = meetings.find((mm) => mm.periodo === p);
        return { monthLabel: periodoShortLabel(p), value: m ? m[key] : null };
      });
    }

    exportMeetingReportPdf({
      fileSlug: "reuniao-salao",
      empresaName,
      periodoLabel: periodoLabel(selectedPeriodo),
      premiacaoTotal,
      observacoes: form.notas,
      indicators: [
        // NPS Geral, Faturamento do Salão e Ticket Médio deixaram de ter meta/premiação
        // (viraram indicadores informativos; um valor de referência livre entra na
        // lista de "Fechamento do mês" quando fizer sentido) — por enquanto o PDF só
        // mostra o histórico do valor real de cada um, sem linha de meta nem
        // premiação. As metas por produto abaixo continuam com meta+premiação
        // normalmente (mecanismo à parte, que não mudou).
        {
          key: "nps",
          label: "NPS Geral",
          unit: "percent",
          meta: 0,
          metaDirection: "max",
          status: statusOf(null),
          premio: 0,
          historico: historico("npsPercent", metrics.npsPercent),
        },
        {
          key: "faturamento",
          label: "Faturamento do Salão",
          unit: "currency",
          meta: 0,
          metaDirection: "max",
          status: statusOf(null),
          premio: 0,
          historico: historico("faturamentoValor", metrics.faturamentoValor),
        },
        {
          key: "ticket-medio",
          label: "Ticket Médio",
          unit: "currency",
          meta: 0,
          metaDirection: "max",
          status: statusOf(null),
          premio: 0,
          historico: historico("ticketMedioValor", metrics.ticketMedioValor),
        },
        ...produtoForm.map((p) => {
          const qtd = p.quantidade === "" ? null : Number(p.quantidade);
          const meta = Number(p.meta) || 0;
          const bateu = qtd === null || meta <= 0 ? null : qtd >= meta;
          const pontos = periodosComparados.map((periodo) => {
            if (periodo === selectedPeriodo) return { monthLabel: periodoShortLabel(periodo), value: qtd };
            const produtoMeta = meetings.find((mm) => mm.periodo === periodo)?.produtoMetas.find((x) => x.produto === p.produto);
            return { monthLabel: periodoShortLabel(periodo), value: produtoMeta?.quantidade ?? null };
          });
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
    const fdmToken = fdm.beginFetch();
    const res = await fetch(`/api/reuniao/salao?periodo=${targetPeriodo}`);
    const data = await res.json();
    setMeetings(data.meetings);
    setCurrent(data.current);
    setMetrics(data.metrics);
    setMelhorVendedor(data.melhorVendedor);
    setComentarios(data.comentarios);
    fdm.sync(fdmToken, data.customIndicators ?? []);
  }

  async function submit() {
    if (saving) return;
    setSaving(true);
    try {
      await fetch("/api/reuniao/salao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodo: selectedPeriodo,
          ...form,
          produtoMetas: produtoForm,
          customIndicators: fdm.buildIndicatorsPayload(),
        }),
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
    setFechamentoModalOpen(true);
  }

  async function doDelete() {
    if (deleting || !current) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/reuniao/salao?periodo=${current.periodo}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error || "Não foi possível excluir esta reunião.");
        return;
      }
      setConfirmDelete(false);
      setCurrent(null);
      setForm(buildForm(null));
      setProdutoForm(buildProdutoForm(null));
      await refresh(selectedPeriodo);
    } finally {
      setDeleting(false);
    }
  }

  const cards = [
    {
      key: "nps",
      content: (
        <IndicatorCard
          icon="Smile"
          color="#1464F4"
          label="NPS Geral"
          status={statusOf(null)}
          valueSlot={
            <span className="text-2xl font-semibold text-white">
              {metrics.npsPercent === null ? "-" : `${formatNumber(metrics.npsPercent, 1)}%`}
            </span>
          }
          metaText="Indicador informativo"
          premio={0}
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
          status={statusOf(null)}
          valueSlot={<span className="text-2xl font-semibold text-white">{formatCurrency(metrics.faturamentoValor)}</span>}
          metaText="Indicador informativo"
          premio={0}
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
          status={statusOf(null)}
          valueSlot={
            <span className="text-2xl font-semibold text-white">
              {metrics.ticketMedioValor === null ? "-" : formatCurrency(metrics.ticketMedioValor)}
            </span>
          }
          metaText="Indicador informativo"
          premio={0}
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

      <SortableCardGrid
        storageKey="reuniao-salao-kpi-order"
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
        items={[...cards, ...customIndicatorCards(fdm.customIndicators)]}
      />

      {premiacaoTotal > 0 && (
        <div className="nord-card p-4 flex items-center gap-3 bg-amber-950/10 border-amber-900/40">
          <Trophy size={20} className="text-amber-400 shrink-0" />
          <span className="text-sm text-white">
            Premiação total do mês: <strong>{formatCurrency(premiacaoTotal)}</strong>
          </span>
        </div>
      )}

      {canCreate && <FechamentoDoMesSection indicators={fdm.customIndicators} onEditClick={() => setFechamentoModalOpen(true)} />}

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
              {produtoForm.map((p) => {
                const qtd = p.quantidade === "" ? null : Number(p.quantidade);
                const metaValor = Number(p.meta) || 0;
                const bateu = qtd === null || metaValor <= 0 ? null : qtd >= metaValor;
                return (
                  <tr key={p.produto} className="border-b border-nord-border/50">
                    <td className="py-2 px-3 text-white">{p.produto}</td>
                    <td className="py-2 px-3">
                      <span className="text-nord-gray">{qtd ?? "-"}</span>
                    </td>
                    <td className="py-2 px-3">
                      <span className="text-nord-gray">{formatNumber(Number(p.meta) || 0, 0)} un.</span>
                    </td>
                    <td className="py-2 px-3">
                      <Badge tone={bateu === null ? "default" : bateu ? "success" : "warning"}>
                        {bateu === null ? "Sem dado" : bateu ? "Meta batida" : "Abaixo da meta"}
                      </Badge>
                    </td>
                    <td className="py-2 px-3">
                      <span className="text-amber-400">{formatCurrency(Number(p.premiacao) || 0)}</span>
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
              <span className="text-lg font-semibold text-white">{form[f.key] || "-"}</span>
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

      {canCreate && (
        <Modal
          open={fechamentoModalOpen}
          onClose={() => setFechamentoModalOpen(false)}
          title={`Fechamento do mês — ${periodoLabel(selectedPeriodo)}`}
          widthClass="max-w-3xl"
        >
          <div className="space-y-5">
            <div>
              <h4 className="text-white text-sm font-medium mb-3">Resultado do período</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                {NPS_DETALHADO_FIELDS.map((f) => (
                  <label key={f.key} className="block">
                    <span className="block text-xs text-nord-gray mb-1">{f.label}</span>
                    <input
                      type="number"
                      value={form[f.key]}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      className="input"
                      placeholder="nota"
                    />
                  </label>
                ))}
              </div>
              <div className="overflow-x-auto nord-scrollbar">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-white border-b border-nord-border">
                      <th className="py-2 px-3">Produto</th>
                      <th className="py-2 px-3">Quantidade vendida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {produtoForm.map((p, i) => (
                      <tr key={p.produto} className="border-b border-nord-border/50">
                        <td className="py-2 px-3 text-white">{p.produto}</td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            value={p.quantidade}
                            onChange={(e) =>
                              setProdutoForm((prev) => prev.map((x, idx) => (idx === i ? { ...x, quantidade: e.target.value } : x)))
                            }
                            className="input"
                            placeholder="un."
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 className="text-white text-sm font-medium mb-3">Metas e premiação por produto</h4>
              <div className="overflow-x-auto nord-scrollbar">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-white border-b border-nord-border">
                      <th className="py-2 px-3">Produto</th>
                      <th className="py-2 px-3">Meta (un.)</th>
                      <th className="py-2 px-3">Premiação (R$)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {produtoForm.map((p, i) => (
                      <tr key={p.produto} className="border-b border-nord-border/50">
                        <td className="py-2 px-3 text-white">{p.produto}</td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            value={p.meta}
                            onChange={(e) => setProdutoForm((prev) => prev.map((x, idx) => (idx === i ? { ...x, meta: e.target.value } : x)))}
                            className="input"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            value={p.premiacao}
                            onChange={(e) =>
                              setProdutoForm((prev) => prev.map((x, idx) => (idx === i ? { ...x, premiacao: e.target.value } : x)))
                            }
                            className="input"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <FechamentoDoMesEditor fdm={fdm} />

            <div className="flex items-center justify-between pt-2 border-t border-nord-border">
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
                  setFechamentoModalOpen(false);
                }}
                disabled={saving}
                className="bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2 px-4"
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
