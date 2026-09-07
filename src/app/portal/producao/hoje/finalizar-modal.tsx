"use client";

import { useState } from "react";
import { Modal, FormError } from "@/components/ui/modal";
import { compareProducedToPlanned } from "@/lib/producao";
import type { ProductionOrderDTO } from "../types";

export function FinalizarModal({
  ordem,
  onClose,
  onDone,
}: {
  ordem: ProductionOrderDTO;
  onClose: () => void;
  onDone: () => void;
}) {
  const planejado = ordem.quantidadeAprovada ?? ordem.quantidadeSugerida;
  const [quantidade, setQuantidade] = useState(String(planejado));
  const [observacao, setObservacao] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quantidadeNum = Number(quantidade.replace(",", "."));
  const comparison = Number.isFinite(quantidadeNum) ? compareProducedToPlanned(planejado, quantidadeNum, 10) : null;

  async function submit() {
    if (!Number.isFinite(quantidadeNum) || quantidadeNum < 0) {
      setError("Informe uma quantidade válida.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/producao/ordens/${ordem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finalizar", quantidadeProduzida: quantidadeNum, observacao: observacao || null }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Não foi possível finalizar a produção.");
        return;
      }
      onDone();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Finalizar produção — ${ordem.productionItem.name}`}>
      <div className="space-y-3">
        <FormError message={error} />
        <p className="text-sm text-nord-gray">
          Planejado: <span className="text-white font-medium">{planejado}</span> {ordem.productionItem.unidade}
        </p>
        <label className="block">
          <span className="block text-xs text-nord-gray mb-1">Quantidade produzida ({ordem.productionItem.unidade})</span>
          <input
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            inputMode="decimal"
            className="input text-lg font-semibold"
            autoFocus
          />
        </label>

        {comparison?.alerta && (
          <div className={`text-xs rounded-lg px-3 py-2 border ${comparison.alerta === "abaixo" ? "bg-amber-950/20 border-amber-900/40 text-amber-300" : "bg-blue-950/20 border-blue-900/40 text-blue-300"}`}>
            ATENÇÃO — {comparison.diferenca < 0 ? `${Math.abs(comparison.diferenca).toFixed(2)} ${ordem.productionItem.unidade} abaixo do planejado` : `produção ${Math.abs(comparison.diferencaPercent).toFixed(0)}% acima do planejado`}.
          </div>
        )}

        <label className="block">
          <span className="block text-xs text-nord-gray mb-1">Observação (opcional)</span>
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={2}
            className="input"
            placeholder="Ex.: Produzido em duas bateladas."
          />
        </label>

        <button
          onClick={submit}
          disabled={loading}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
        >
          {loading ? "Salvando..." : "Finalizar Produção"}
        </button>
      </div>
    </Modal>
  );
}
