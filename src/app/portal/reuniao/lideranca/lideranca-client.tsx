"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Section } from "@/components/ui/stat-card";
import { SortableCardGrid } from "@/components/ui/sortable-stat-cards";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { IndicatorCard, statusOf } from "@/components/reuniao/indicator-card";
import {
  FechamentoDoMesSection,
  FechamentoDoMesEditor,
  useFechamentoDoMes,
  customIndicatorCards,
  type FechamentoIndicator,
} from "@/components/reuniao/fechamento-do-mes";
import { formatCurrency, formatNumber } from "@/lib/calc";
import { periodoLabel } from "@/lib/reuniao";
import type { LiderancaResumoDTO } from "@/lib/reuniao-server";

type Meeting = { id: string; periodo: string };
type Fontes = LiderancaResumoDTO["fontes"];

const FONTE_LABEL: Record<keyof Fontes, string> = {
  gerente: "Gerente",
  salao: "Salão",
  cozinha: "Cozinha",
  delivery: "Delivery",
};

/** Aviso discreto pro card de um número que vem de uma área que ainda não
 * "fechou o mês" (ver LiderancaResumoDTO.fontes) — o número pode até já
 * existir (calculado ao vivo de Vendas/CRM/Estoque), mas ninguém revisou/
 * confirmou aquela reunião ainda, então não é tratado como definitivo. */
function fonteAviso(fontes: Fontes, area: keyof Fontes) {
  return fontes[area] ? null : `${FONTE_LABEL[area]} ainda não fechou este mês`;
}

export function LiderancaClient({
  initialCurrent,
  initialResumo,
  initialCustomIndicators,
  periodo,
  canCreate,
}: {
  initialCurrent: Meeting | null;
  initialResumo: LiderancaResumoDTO;
  initialCustomIndicators: FechamentoIndicator[];
  periodo: string;
  canCreate: boolean;
}) {
  const [selectedPeriodo, setSelectedPeriodo] = useState(periodo);
  const [current, setCurrent] = useState(initialCurrent);
  const [resumo, setResumo] = useState(initialResumo);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fechamentoModalOpen, setFechamentoModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fdm = useFechamentoDoMes("/api/reuniao/lideranca", selectedPeriodo, initialCustomIndicators);

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    let cancelled = false;
    const fdmToken = fdm.beginFetch();
    setLoading(true);
    fetch(`/api/reuniao/lideranca?periodo=${selectedPeriodo}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setCurrent(data.current);
        setResumo(data.resumo);
        fdm.sync(fdmToken, data.customIndicators ?? []);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fdm.sync só chama setState estáveis por baixo (ver useFechamentoDoMes); incluir `fdm` recriaria o efeito a cada render (objeto novo) e causaria um loop de fetch.
  }, [selectedPeriodo]);

  async function refresh(targetPeriodo: string) {
    const fdmToken = fdm.beginFetch();
    const res = await fetch(`/api/reuniao/lideranca?periodo=${targetPeriodo}`);
    const data = await res.json();
    setCurrent(data.current);
    setResumo(data.resumo);
    fdm.sync(fdmToken, data.customIndicators ?? []);
  }

  async function submit() {
    if (saving) return;
    setSaving(true);
    try {
      await fetch("/api/reuniao/lideranca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodo: selectedPeriodo, customIndicators: fdm.buildIndicatorsPayload() }),
      });
      await refresh(selectedPeriodo);
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (deleting || !current) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/reuniao/lideranca?periodo=${current.periodo}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error || "Não foi possível excluir esta reunião.");
        return;
      }
      setConfirmDelete(false);
      setCurrent(null);
      await refresh(selectedPeriodo);
    } finally {
      setDeleting(false);
    }
  }

  const cards = [
    {
      key: "faturamento",
      content: (
        <IndicatorCard
          icon="DollarSign"
          color="#22c55e"
          label="Faturamento Total"
          status={statusOf(null)}
          valueSlot={
            <span className="text-2xl font-semibold text-white">
              {resumo.faturamentoTotalValor === null ? "-" : formatCurrency(resumo.faturamentoTotalValor)}
            </span>
          }
          metaText="Indicador informativo"
          premio={0}
          warning={fonteAviso(resumo.fontes, "cozinha")}
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
          status={statusOf(null)}
          valueSlot={
            <span className="text-2xl font-semibold text-white">
              {resumo.cmvPercent === null ? "-" : `${formatNumber(resumo.cmvPercent, 1)}%`}
            </span>
          }
          metaText="Indicador informativo"
          premio={0}
          warning={fonteAviso(resumo.fontes, "cozinha")}
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
          status={statusOf(null)}
          valueSlot={
            <span className="text-2xl font-semibold text-white">
              {resumo.npsPercent === null ? "-" : `${formatNumber(resumo.npsPercent, 1)}%`}
            </span>
          }
          metaText="Indicador informativo"
          premio={0}
          warning={fonteAviso(resumo.fontes, "salao")}
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
          status={statusOf(null)}
          valueSlot={
            <span className="text-2xl font-semibold text-white">
              {resumo.cancelamentoDeliveryPercent === null ? "-" : `${formatNumber(resumo.cancelamentoDeliveryPercent, 1)}%`}
            </span>
          }
          metaText="Indicador informativo"
          premio={0}
          warning={fonteAviso(resumo.fontes, "delivery")}
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
          status={statusOf(null)}
          valueSlot={
            <span className="text-2xl font-semibold text-white">
              {resumo.turnoverPercent === null ? "-" : `${formatNumber(resumo.turnoverPercent, 1)}%`}
            </span>
          }
          metaText="Indicador informativo"
          premio={0}
          warning={fonteAviso(resumo.fontes, "gerente")}
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
          status={statusOf(null)}
          valueSlot={
            <span className="text-2xl font-semibold text-white">
              {resumo.checklistOperacionalPercent === null ? "-" : `${formatNumber(resumo.checklistOperacionalPercent, 1)}%`}
            </span>
          }
          metaText="Indicador informativo"
          premio={0}
          warning={fonteAviso(resumo.fontes, "gerente")}
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
        {canCreate && (
          <button onClick={() => setFechamentoModalOpen(true)} className="text-xs text-nord-blue-light hover:underline">
            Editar fechamento do mês
          </button>
        )}
      </div>

      <Section title="Resultado do período">
        <SortableCardGrid
          storageKey="reuniao-lideranca-resumo-kpi-order"
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          items={[...cards, ...customIndicatorCards(fdm.customIndicators)]}
        />
      </Section>

      {canCreate && <FechamentoDoMesSection indicators={fdm.customIndicators} onEditClick={() => setFechamentoModalOpen(true)} />}

      {canCreate && (
        <Modal
          open={fechamentoModalOpen}
          onClose={() => setFechamentoModalOpen(false)}
          title={`Fechamento do mês — ${periodoLabel(selectedPeriodo)}`}
          widthClass="max-w-2xl"
        >
          <div className="space-y-5">
            <FechamentoDoMesEditor fdm={fdm} />

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
          `Tem certeza que deseja excluir o fechamento de ${periodoLabel(selectedPeriodo)}? O histórico desse período será perdido.`
        }
        onConfirm={doDelete}
        onCancel={() => {
          setConfirmDelete(false);
          setDeleteError(null);
        }}
        confirmLabel={deleting ? "Excluindo..." : "Excluir"}
        danger
      />

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
