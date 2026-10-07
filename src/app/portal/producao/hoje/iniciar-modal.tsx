"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { Modal, FormError } from "@/components/ui/modal";
import type { ProductionOrderDTO, UserOption } from "../types";

export function IniciarModal({
  ordem,
  teamMembers,
  onClose,
  onDone,
}: {
  ordem: ProductionOrderDTO;
  teamMembers: UserOption[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [responsavelId, setResponsavelId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/producao/ordens/${ordem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "iniciar", ...(responsavelId ? { responsavelId } : {}) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Não foi possível iniciar a produção.");
        // 409: outra pessoa já iniciou/concluiu — atualiza a lista pra tela refletir o status real.
        if (res.status === 409) onDone();
        return;
      }
      onDone();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Iniciar produção — ${ordem.productionItem.name}`}>
      <div className="space-y-3">
        <FormError message={error} />
        <label className="block">
          <span className="block text-xs text-nord-gray mb-1">Responsável pela produção</span>
          <select value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)} className="input" autoFocus>
            <option value="">Eu mesmo (quem está logado)</option>
            {teamMembers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <span className="block text-[11px] text-nord-gray mt-1">
            Escolha quem da equipe vai de fato produzir este item, ou deixe em branco para assumir você mesmo.
          </span>
        </label>

        <button
          onClick={submit}
          disabled={loading}
          className="w-full flex items-center justify-center gap-1.5 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
        >
          <Play size={14} /> {loading ? "Iniciando..." : "Iniciar Produção"}
        </button>
      </div>
    </Modal>
  );
}
