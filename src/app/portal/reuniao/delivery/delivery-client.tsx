"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, FileDown, Trash2 } from "lucide-react";
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
import { formatNumber } from "@/lib/calc";
import { periodoLabel, periodoShortLabel, resolveComparePeriodos } from "@/lib/reuniao";

type Meeting = {
  id: string;
  periodo: string;
  cancelamentoPercent: number | null;
  avaliacaoNota: number | null;
  tempoEntregaMinutos: number | null;
  chamadosPercent: number | null;
  notas: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { name: string };
};

type Metrics = { cancelamentoPercent: number | null };

function formToPayload(periodo: string, form: ReturnType<typeof buildForm>) {
  return { periodo, ...form };
}

// Avaliações (iFood), Tempo de Entrega e Chamados não têm mais input no modal "Fechamento
// do mês" (seção "Resultado do período" removida a pedido do usuário), mas continuam
// inicializados aqui a partir do registro já salvo: eles ainda aparecem (somente leitura) na
// tabela "Histórico de reuniões" mais abaixo e entram no comparativo do PDF exportado (ver
// `avaliacaoValor`/`tempoEntregaValor`/`chamadosValor` e `historico()` em `exportPdf`). A
// rota POST /api/reuniao/delivery trata qualquer um desses 3 campos ausente no body como
// "grava null" (ver route.ts) — se o form parasse de incluí-los, salvar o modal por qualquer
// outro motivo (ex.: só um indicador do "Fechamento do mês") apagaria retroativamente um
// valor já lançado em um mês anterior. Mesmo padrão usado na Reunião Gerente/Salão (ver
// gerente-client.tsx/salao-client.tsx).
function buildForm(m?: Meeting | null) {
  return {
    avaliacaoNota: m?.avaliacaoNota != null ? String(m.avaliacaoNota) : "",
    tempoEntregaMinutos: m?.tempoEntregaMinutos != null ? String(m.tempoEntregaMinutos) : "",
    chamadosPercent: m?.chamadosPercent != null ? String(m.chamadosPercent) : "",
    notas: m?.notas ?? "",
  };
}

export function DeliveryClient({
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
  const [form, setForm] = useState(buildForm(initialCurrent));
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fechamentoModalOpen, setFechamentoModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [comparePeriodos, setComparePeriodos] = useState<[string, string, string]>(["", "", ""]);

  const fdm = useFechamentoDoMes("/api/reuniao/delivery", selectedPeriodo, initialCustomIndicators);
  const mp = useMetasProximoMes("/api/reuniao/delivery", canCreate);

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    let cancelled = false;
    const fdmToken = fdm.beginFetch();
    setLoading(true);
    fetch(`/api/reuniao/delivery?periodo=${selectedPeriodo}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setCurrent(data.current);
        setMetrics(data.metrics);
        setForm(buildForm(data.current));
        fdm.sync(fdmToken, data.customIndicators ?? []);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fdm.sync só chama setState estáveis por baixo (ver useFechamentoDoMes); incluir `fdm` recriaria o efeito a cada render (objeto novo) e causaria um loop de fetch.
  }, [selectedPeriodo]);

  const avaliacaoValor = form.avaliacaoNota ? Number(form.avaliacaoNota) : null;
  const tempoEntregaValor = form.tempoEntregaMinutos ? Number(form.tempoEntregaMinutos) : null;
  const chamadosValor = form.chamadosPercent ? Number(form.chamadosPercent) : null;

  async function exportPdf() {
    const { exportMeetingReportPdf } = await import("@/lib/reuniao-pdf");
    const periodosComparados = resolveComparePeriodos(selectedPeriodo, comparePeriodos);

    // Busca as metas do próximo mês na hora de exportar (não reaproveita o estado `mp.metas`
    // já carregado na tela) pra garantir que o PDF sai com o que está salvo agora — mesmo
    // padrão da Reunião Gerente (ver fetchMetasProximoMesForPdf).
    const metasData = await fetchMetasProximoMesForPdf("/api/reuniao/delivery");

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

    // Cancelamento, Avaliações, Tempo de Entrega e Chamados deixaram de ter
    // meta/premiação (viraram indicadores informativos; um valor de referência
    // livre entra na lista de "Fechamento do mês" quando fizer sentido) — o PDF
    // por enquanto só mostra o histórico do valor real de cada um, sem linha de
    // meta nem premiação (o relatório em si ainda precisa de um redesenho,
    // pensado em cima do conceito de "bateu a meta").
    exportMeetingReportPdf({
      fileSlug: "reuniao-delivery",
      empresaName,
      periodoLabel: periodoLabel(selectedPeriodo),
      premiacaoTotal: 0,
      observacoes: form.notas,
      indicators: [
        {
          key: "cancelamento",
          label: "Cancelamento",
          unit: "percent",
          meta: 0,
          metaDirection: "min",
          status: statusOf(null),
          premio: 0,
          historico: historico("cancelamentoPercent", metrics.cancelamentoPercent),
        },
        {
          key: "avaliacao",
          label: "Avaliações (iFood)",
          unit: "rating",
          meta: 0,
          metaDirection: "max",
          status: statusOf(null),
          premio: 0,
          historico: historico("avaliacaoNota", avaliacaoValor),
        },
        {
          key: "tempo-entrega",
          label: "Tempo de Entrega",
          unit: "minutes",
          meta: 0,
          metaDirection: "min",
          status: statusOf(null),
          premio: 0,
          historico: historico("tempoEntregaMinutos", tempoEntregaValor),
        },
        {
          key: "chamados",
          label: "Chamados",
          unit: "percent",
          meta: 0,
          metaDirection: "min",
          status: statusOf(null),
          premio: 0,
          historico: historico("chamadosPercent", chamadosValor),
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
    const fdmToken = fdm.beginFetch();
    const res = await fetch(`/api/reuniao/delivery?periodo=${targetPeriodo}`);
    const data = await res.json();
    setMeetings(data.meetings);
    setCurrent(data.current);
    setMetrics(data.metrics);
    fdm.sync(fdmToken, data.customIndicators ?? []);
  }

  async function submit() {
    if (saving) return;
    setSaving(true);
    try {
      await fetch("/api/reuniao/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formToPayload(selectedPeriodo, form), customIndicators: fdm.buildIndicatorsPayload() }),
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
    setFechamentoModalOpen(true);
  }

  async function doDelete() {
    if (deleting || !current) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/reuniao/delivery?periodo=${current.periodo}`, { method: "DELETE" });
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
          tem o que mostrar aqui — mesmo padrão de aviso já usado em gerente-client.tsx e
          lideranca-client.tsx (reaproveitado aqui em vez de inventar um texto novo). */}
      {!canCreate && (
        <p className="text-xs text-nord-warning bg-nord-warning/10 border border-nord-warning/30 rounded-lg px-3 py-2">
          Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para ver e
          editar o fechamento do mês desta reunião.
        </p>
      )}

      {canCreate && <FechamentoDoMesSection indicators={fdm.customIndicators} onEditClick={() => setFechamentoModalOpen(true)} />}

      {canCreate && (
        <Modal
          open={fechamentoModalOpen}
          onClose={() => setFechamentoModalOpen(false)}
          title={`Fechamento do mês — ${periodoLabel(selectedPeriodo)}`}
          widthClass="max-w-2xl"
        >
          <div className="space-y-5">
            {/* Seção "Resultado do período" (Avaliações iFood + Tempo de Entrega + Chamados)
                removida a pedido do usuário — aparecia sempre vazia no modal. Os valores
                continuam aparecendo, só que somente leitura, na tabela "Histórico de
                reuniões" mais abaixo na tela (fora do modal) — ver comentário de `buildForm`
                acima para como esses 3 campos continuam "congelados" no round-trip do
                `submit()`. */}
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
