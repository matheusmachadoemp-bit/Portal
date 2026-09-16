"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { FechamentoDoMesSection, FechamentoDoMesEditor, useFechamentoDoMes, type FechamentoIndicator } from "@/components/reuniao/fechamento-do-mes";
import { useMetasProximoMes, MetasProximoMesSection } from "@/components/reuniao/metas-proximo-mes";
import { periodoLabel } from "@/lib/reuniao";

type Meeting = { id: string; periodo: string };

export function LiderancaClient({
  initialCurrent,
  initialCustomIndicators,
  periodo,
  canCreate,
  canDeleteMetas,
}: {
  initialCurrent: Meeting | null;
  initialCustomIndicators: FechamentoIndicator[];
  periodo: string;
  canCreate: boolean;
  /** Controla só o botão de excluir do card "Metas de [próximo mês]" — ver
   * canDeleteMetas em gerente/page.tsx (mesmo critério, `canDelete` no módulo "reuniao"). */
  canDeleteMetas: boolean;
}) {
  const [selectedPeriodo, setSelectedPeriodo] = useState(periodo);
  const [current, setCurrent] = useState(initialCurrent);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fechamentoModalOpen, setFechamentoModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fdm = useFechamentoDoMes("/api/reuniao/lideranca", selectedPeriodo, initialCustomIndicators);
  const mp = useMetasProximoMes("/api/reuniao/lideranca", canCreate);

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

      {/* Sem loja específica selecionada (visão consolidada "Grupo Nord"), a reunião não
          tem o que mostrar aqui — mesmo padrão de aviso já usado em gerente-client.tsx
          (reaproveitado aqui em vez de inventar um texto novo). */}
      {!canCreate && (
        <p className="text-xs text-nord-warning bg-nord-warning/10 border border-nord-warning/30 rounded-lg px-3 py-2">
          Você está no modo Grupo Nord (consolidado). Selecione uma loja específica no menu lateral para ver e
          editar o fechamento do mês desta reunião.
        </p>
      )}

      {canCreate && <FechamentoDoMesSection indicators={fdm.customIndicators} onEditClick={() => setFechamentoModalOpen(true)} />}

      {/* Liderança não tem "Observações da reunião" (não existe esse campo pra ela) — o card
          "Metas de [próximo mês]" fica logo depois de "Fechamento do mês", mesma posição
          relativa das outras 4 reuniões. */}
      {canCreate && <MetasProximoMesSection mp={mp} canDelete={canDeleteMetas} />}

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
