"use client";

import { useState } from "react";
import { Modal, FormError } from "@/components/ui/modal";
import { PRODUCTION_AJUSTE_MOTIVO_OPTIONS } from "@/lib/producao";
import type { ProductionOrderDTO } from "../types";

export function AjusteModal({
  ordem,
  onClose,
  onDone,
}: {
  ordem: ProductionOrderDTO;
  onClose: () => void;
  onDone: () => void;
}) {
  const sugerida = ordem.quantidadeSugerida;
  const [quantidade, setQuantidade] = useState(String(ordem.quantidadeAprovada ?? sugerida));
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (loading) return;
    const quantidadeNum = Number(quantidade.replace(",", "."));
    if (!Number.isFinite(quantidadeNum) || quantidadeNum < 0) {
      setError("Informe uma quantidade válida.");
      return;
    }
    if (!motivo) {
      setError("Selecione o motivo do ajuste.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/producao/ordens/${ordem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ajustar", quantidadeAprovada: quantidadeNum, motivo }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Não foi possível ajustar a quantidade.");
        return;
      }
      onDone();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Ajustar produção — ${ordem.productionItem.name}`}>
      <div className="space-y-3">
        <FormError message={error} />
        <p className="text-sm text-nord-gray">
          Sistema recomenda: <span className="text-white font-medium">{sugerida}</span> {ordem.productionItem.unidade}
        </p>
        <label className="block">
          <span className="block text-xs text-nord-gray mb-1">Nova quantidade ({ordem.productionItem.unidade})</span>
          <input value={quantidade} onChange={(e) => setQuantidade(e.target.value)} inputMode="decimal" className="input" autoFocus />
        </label>
        <label className="block">
          <span className="block text-xs text-nord-gray mb-1">Motivo do ajuste</span>
          <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="input">
            <option value="">Selecione...</option>
            {PRODUCTION_AJUSTE_MOTIVO_OPTIONS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[11px] text-nord-gray">A sugestão original do sistema é sempre mantida no histórico.</p>
        <button
          onClick={submit}
          disabled={loading}
          className="w-full bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
        >
          {loading ? "Salvando..." : "Salvar ajuste"}
        </button>
      </div>
    </Modal>
  );
}
