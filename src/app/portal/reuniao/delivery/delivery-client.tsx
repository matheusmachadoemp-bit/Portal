"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, FileDown, Trash2 } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { SortableCardGrid } from "@/components/ui/sortable-stat-cards";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { DynamicIcon } from "@/components/dynamic-icon";
import { IndicatorCard, statusOf } from "@/components/reuniao/indicator-card";
import { CompareMonthsPicker } from "@/components/reuniao/compare-months";
import { FechamentoDoMesSection, FechamentoDoMesEditor, useFechamentoDoMes, type FechamentoIndicator } from "@/components/reuniao/fechamento-do-mes";
import { formatNumber } from "@/lib/calc";
import { compareToPrevious, periodoLabel, periodoShortLabel, previousPeriodo, resolveComparePeriodos } from "@/lib/reuniao";

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
  empresaName,
}: {
  initialMeetings: Meeting[];
  initialCurrent: Meeting | null;
  initialMetrics: Metrics;
  initialCustomIndicators: FechamentoIndicator[];
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
  const [fechamentoModalOpen, setFechamentoModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [comparePeriodos, setComparePeriodos] = useState<[string, string, string]>(["", "", ""]);

  const fdm = useFechamentoDoMes("/api/reuniao/delivery", initialCustomIndicators);

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
        fdm.sync(data.customIndicators ?? []);
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

  const previousMeeting = useMemo(
    () => meetings.find((m) => m.periodo === previousPeriodo(selectedPeriodo)) ?? null,
    [meetings, selectedPeriodo]
  );
  const compCancelamento = compareToPrevious(metrics.cancelamentoPercent, previousMeeting?.cancelamentoPercent, "min");
  const compAvaliacao = compareToPrevious(avaliacaoValor, previousMeeting?.avaliacaoNota, "max");
  const compTempoEntrega = compareToPrevious(tempoEntregaValor, previousMeeting?.tempoEntregaMinutos, "min");
  const compChamados = compareToPrevious(chamadosValor, previousMeeting?.chamadosPercent, "min");

  async function exportPdf() {
    const { exportMeetingReportPdf } = await import("@/lib/reuniao-pdf");
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
    });
  }

  async function refresh(targetPeriodo: string) {
    const res = await fetch(`/api/reuniao/delivery?periodo=${targetPeriodo}`);
    const data = await res.json();
    setMeetings(data.meetings);
    setCurrent(data.current);
    setMetrics(data.metrics);
    fdm.sync(data.customIndicators ?? []);
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

  const cards = [
    {
      key: "cancelamento",
      content: (
        <IndicatorCard
          icon="XCircle"
          color="#ef4444"
          label="Cancelamento"
          status={statusOf(null)}
          valueSlot={
            <span className="text-2xl font-semibold text-white">
              {metrics.cancelamentoPercent === null ? "-" : `${formatNumber(metrics.cancelamentoPercent, 1)}%`}
            </span>
          }
          metaText="Indicador informativo"
          premio={0}
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
          status={statusOf(null)}
          valueSlot={<span className="text-2xl font-semibold text-white">{avaliacaoValor ?? "-"}</span>}
          metaText="Indicador informativo"
          premio={0}
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
          status={statusOf(null)}
          valueSlot={<span className="text-2xl font-semibold text-white">{tempoEntregaValor ?? "-"} min</span>}
          metaText="Indicador informativo"
          premio={0}
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
          status={statusOf(null)}
          valueSlot={<span className="text-2xl font-semibold text-white">{chamadosValor === null ? "-" : `${chamadosValor}%`}</span>}
          metaText="Indicador informativo"
          premio={0}
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
            <button onClick={() => setFechamentoModalOpen(true)} className="text-xs text-nord-blue-light hover:underline">
              Editar fechamento do mês
            </button>
          )}
        </div>
      </div>

      <SortableCardGrid
        storageKey="reuniao-delivery-kpi-order"
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4"
        items={cards}
      />

      {canCreate && <FechamentoDoMesSection indicators={fdm.customIndicators} onEditClick={() => setFechamentoModalOpen(true)} />}

      {canCreate && (
        <Modal
          open={fechamentoModalOpen}
          onClose={() => setFechamentoModalOpen(false)}
          title={`Fechamento do mês — ${periodoLabel(selectedPeriodo)}`}
          widthClass="max-w-2xl"
        >
          <div className="space-y-5">
            <div>
              <h4 className="text-white text-sm font-medium mb-3">Resultado do período</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">Avaliações (iFood)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={form.avaliacaoNota}
                    onChange={(e) => setForm({ ...form, avaliacaoNota: e.target.value })}
                    placeholder="nota"
                    className="input"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">Tempo de Entrega (min)</span>
                  <input
                    type="number"
                    value={form.tempoEntregaMinutos}
                    onChange={(e) => setForm({ ...form, tempoEntregaMinutos: e.target.value })}
                    placeholder="minutos"
                    className="input"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">Chamados (%)</span>
                  <input
                    type="number"
                    value={form.chamadosPercent}
                    onChange={(e) => setForm({ ...form, chamadosPercent: e.target.value })}
                    placeholder="%"
                    className="input"
                  />
                </label>
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
