"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, FileDown, Quote, Trash2 } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { DynamicIcon } from "@/components/dynamic-icon";
import { statusOf } from "@/components/reuniao/indicator-card";
import { CompareMonthsPicker } from "@/components/reuniao/compare-months";
import {
  FechamentoDoMesSection,
  FechamentoDoMesEditor,
  useFechamentoDoMes,
  type FechamentoIndicator,
} from "@/components/reuniao/fechamento-do-mes";
import { useMetasProximoMes, MetasProximoMesSection, fetchMetasProximoMesForPdf } from "@/components/reuniao/metas-proximo-mes";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { periodoLabel, periodoShortLabel, resolveComparePeriodos, SALAO_PRODUTOS_PADRAO } from "@/lib/reuniao";

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

// Os 5 campos de nota (Qualidade do Produto, Atendimento, Ambiente, Rodízio, Tempo de
// Espera) não têm mais input no modal "Fechamento do mês" (seção "Resultado do período"
// removida a pedido do usuário — sempre apareciam vazios), mas continuam inicializados aqui
// a partir do registro já salvo: (1) a seção "NPS detalhado por categoria", fora do modal,
// ainda exibe esses valores (agora congelados) e a comparação com o mês anterior; (2) a rota
// POST /api/reuniao/salao trata qualquer um desses campos ausente no body como "grava null"
// (ver route.ts) — se o form parasse de incluí-los, salvar o modal por qualquer outro motivo
// (ex.: só um indicador do "Fechamento do mês") apagaria retroativamente uma nota já lançada
// em um mês anterior. Mesmo padrão usado na Reunião Gerente para turnoverPercent/
// faltasAtrasosAtestados/checklistOperacionalPercent (ver gerente-client.tsx).
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

// `quantidade`/`meta`/`premiacao` por produto também não têm mais input no modal (as tabelas
// "Produto / Quantidade vendida", dentro de "Resultado do período", e "Metas e premiação por
// produto" foram removidas junto, mesmo print do usuário). Diferente dos 5 campos acima, a
// rota POST /api/reuniao/salao NÃO apaga metas existentes quando `produtoMetas` vem vazio/
// ausente: ela faz um upsert por item do array que vier no body (ver route.ts, loop em torno
// de `salaoProductGoal.upsert`) — item que não vier simplesmente não é tocado, sem risco de
// null-ar nada. Mesmo assim, `produtoForm` continua populado a partir do registro salvo (e o
// `submit()` continua enviando-o) porque a seção "Metas de vendas por produto", fora do modal,
// e o cálculo de `premiacaoTotal` seguem lendo esse estado — sem nenhum input escrevendo nele,
// fica congelado no valor carregado da API (reenviá-lo em cada save é só um no-op seguro).
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
  initialComentarios,
  initialCustomIndicators,
  periodo,
  canCreate,
  canDeleteMetas,
  empresaName,
}: {
  initialMeetings: Meeting[];
  initialCurrent: Meeting | null;
  initialMetrics: Metrics;
  /** Não é mais desestruturada acima (a seção "Melhor vendedor do mês" saiu da
   * tela, pedido do usuário — sempre aparecia vazia). O tipo continua exigindo
   * essa prop porque `page.tsx` ainda calcula e passa `initialMelhorVendedor`
   * (não mexemos no servidor); removê-la do tipo quebraria a chamada de
   * `<SalaoClient>` em page.tsx com uma prop "desconhecida". */
  initialMelhorVendedor: MelhorVendedor;
  initialComentarios: Comentario[];
  initialCustomIndicators: FechamentoIndicator[];
  periodo: string;
  canCreate: boolean;
  /** Controla só o botão de excluir do card "Metas de [próximo mês]" — ver
   * canDeleteMetas em gerente/page.tsx (mesmo critério, `canDelete` no módulo "reuniao"). */
  canDeleteMetas: boolean;
  empresaName: string;
}) {
  const [meetings, setMeetings] = useState(initialMeetings);
  const [selectedPeriodo, setSelectedPeriodo] = useState(periodo);
  const [current, setCurrent] = useState(initialCurrent);
  const [metrics, setMetrics] = useState(initialMetrics);
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
  const mp = useMetasProximoMes("/api/reuniao/salao", canCreate);

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

  async function exportPdf() {
    const { exportMeetingReportPdf } = await import("@/lib/reuniao-pdf");
    const periodosComparados = resolveComparePeriodos(selectedPeriodo, comparePeriodos);

    // Busca as metas do próximo mês na hora de exportar (não reaproveita o estado `mp.metas`
    // já carregado na tela) pra garantir que o PDF sai com o que está salvo agora — mesmo
    // padrão da Reunião Gerente (ver fetchMetasProximoMesForPdf).
    const metasData = await fetchMetasProximoMesForPdf("/api/reuniao/salao");

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
    const fdmToken = fdm.beginFetch();
    const res = await fetch(`/api/reuniao/salao?periodo=${targetPeriodo}`);
    const data = await res.json();
    setMeetings(data.meetings);
    setCurrent(data.current);
    setMetrics(data.metrics);
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

      {canCreate && <FechamentoDoMesSection indicators={fdm.customIndicators} onEditClick={() => setFechamentoModalOpen(true)} />}

      {/* Banner "Premiação total do mês", seção "Melhor vendedor do mês", seção "Metas de
          vendas por produto" e seção "NPS detalhado por categoria" removidas da tela a pedido
          do usuário (prints mostrando a seção de vendedor e a de NPS sempre vazias/"-").
          `premiacaoTotal` e `produtoForm` continuam calculados/populados normalmente — ainda
          alimentam o PDF exportado em `exportPdf()` (premiação total + linha "Meta: {produto}"
          por produto) e o `submit()` continua enviando `produtoForm` pra não apagar retroativamente
          metas já salvas (ver comentários em `buildProdutoForm` acima). A coluna "Premiação total"
          do histórico mais abaixo (`meetingPremiacaoTotal`) também não mudou. */}

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
          widthClass="max-w-2xl"
        >
          <div className="space-y-5">
            {/* Seção "Resultado do período" (5 notas de NPS detalhado + tabela "Produto /
                Quantidade vendida") e seção "Metas e premiação por produto" (tabela Produto/
                Meta/Premiação) já tinham sido removidas do modal antes (apareciam sempre vazias/
                pouco usadas). As seções de exibição somente-leitura que ainda mostravam esses
                valores fora do modal ("Metas de vendas por produto" e "NPS detalhado por
                categoria") também saíram da tela agora, mesmo motivo (prints do usuário
                mostrando tudo vazio/"-") — ver `buildForm`/`buildProdutoForm` acima: os dois
                estados continuam intactos (alimentam o PDF em `exportPdf()` e evitam apagar
                dado salvo no `submit()`), só pararam de ter qualquer exibição na tela. */}
            <FechamentoDoMesEditor fdm={fdm} />

            <div className="flex items-center justify-between pt-2 border-t border-nord-border">
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

    </div>
  );
}
