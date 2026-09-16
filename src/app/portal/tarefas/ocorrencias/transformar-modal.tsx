"use client";

import { useState } from "react";
import { ClipboardList, Wrench } from "lucide-react";
import { Modal, FormError } from "@/components/ui/modal";
import type { Ocorrencia, UserOption } from "./types";

type Tipo = "TASK" | "CHAMADO";

const TIPO_OPTIONS: { key: Tipo; label: string; icon: typeof ClipboardList; description: string }[] = [
  {
    key: "TASK",
    label: "Tarefa",
    icon: ClipboardList,
    description: "Acompanhamento geral (equipe, cliente, processo) — vai para o módulo Tarefas.",
  },
  {
    key: "CHAMADO",
    label: "Chamado de manutenção",
    icon: Wrench,
    description: "Problema de equipamento/estrutura — entra na fila de Manutenção.",
  },
];

export function TransformarOcorrenciaModal({
  ocorrencia,
  teamMembers,
  onClose,
  onTransformed,
}: {
  ocorrencia: Ocorrencia | null;
  teamMembers: UserOption[];
  onClose: () => void;
  /** Mesmo racional do EditarOcorrenciaModal: a resposta não traz as relações que a lista
   * precisa pra renderizar (aqui, nem `task`/`chamado` vêm com todos os campos que a Ocorrência
   * expõe para o link — ver OCORRENCIA_INCLUDE), então o pai recarrega a lista inteira. */
  onTransformed: () => void;
}) {
  const [tipo, setTipo] = useState<Tipo>("TASK");
  const [assigneeId, setAssigneeId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setTipo("TASK");
    setAssigneeId("");
    setError(null);
    onClose();
  }

  if (!ocorrencia) return null;

  async function submit() {
    if (!ocorrencia) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/fechamento-dia/ocorrencias/${ocorrencia.id}/transformar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, assigneeId: assigneeId || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Não foi possível transformar esta ocorrência.");
      handleClose();
      onTransformed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível transformar esta ocorrência.");
      setSaving(false);
    }
  }

  return (
    <Modal open={!!ocorrencia} onClose={handleClose} title="Transformar em ação" widthClass="max-w-lg">
      <FormError message={error} />
      <div className="space-y-4">
        <p className="text-sm text-nord-gray">
          &ldquo;{ocorrencia.descricao}&rdquo;
        </p>

        <div className="space-y-2">
          {TIPO_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = tipo === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setTipo(opt.key)}
                className={`w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                  active ? "border-nord-blue bg-nord-blue/10" : "border-nord-border hover:border-white/30"
                }`}
              >
                <Icon size={18} className={active ? "text-nord-blue-light shrink-0 mt-0.5" : "text-nord-gray shrink-0 mt-0.5"} />
                <span>
                  <span className="block text-sm font-medium text-white">{opt.label}</span>
                  <span className="block text-xs text-nord-gray mt-0.5">{opt.description}</span>
                </span>
              </button>
            );
          })}
        </div>

        <label className="block">
          <span className="block text-xs text-nord-gray mb-1">Responsável</span>
          <select className="input" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Usar responsável do cargo (padrão)</option>
            {teamMembers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-outline" onClick={handleClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? "Transformando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
