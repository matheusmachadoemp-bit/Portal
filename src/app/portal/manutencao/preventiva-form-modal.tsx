"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Modal, FormError } from "@/components/ui/modal";
import { MANUTENCAO_FREQUENCIA_OPTIONS } from "@/lib/manutencao";

type EquipamentoOption = { id: string; nome: string; codigo: string };
type UserOption = { id: string; name: string };
type PrestadorOption = { id: string; nome: string };

const emptyForm = () => ({
  equipamentoId: "",
  tipoServico: "",
  descricao: "",
  frequencia: "MENSAL",
  intervaloDiasCustom: "",
  horario: "",
  responsavelId: "",
  prestadorId: "",
  custoPrevisto: "",
  necessidadeParada: false,
  dataInicio: new Date().toISOString().slice(0, 10),
});

export function PreventivaFormModal({
  open,
  onClose,
  onSaved,
  equipamentos,
  teamMembers,
  prestadores,
  presetEquipamentoId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  equipamentos: EquipamentoOption[];
  teamMembers: UserOption[];
  prestadores: PrestadorOption[];
  presetEquipamentoId?: string;
}) {
  const [form, setForm] = useState(() => ({ ...emptyForm(), equipamentoId: presetEquipamentoId ?? "" }));
  const [checklistDraft, setChecklistDraft] = useState("");
  const [checklist, setChecklist] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ReturnType<typeof emptyForm>>(key: K, value: ReturnType<typeof emptyForm>[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function reset() {
    setForm({ ...emptyForm(), equipamentoId: presetEquipamentoId ?? "" });
    setChecklist([]);
    setChecklistDraft("");
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function addChecklistItem() {
    if (!checklistDraft.trim()) return;
    setChecklist((prev) => [...prev, checklistDraft.trim()]);
    setChecklistDraft("");
  }

  async function handleSubmit() {
    if (saving) return;
    setError(null);
    if (!form.equipamentoId) return setError("Selecione o equipamento.");
    if (!form.tipoServico.trim()) return setError("Informe o tipo de serviço.");

    setSaving(true);
    try {
      const res = await fetch("/api/manutencao/preventivas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          intervaloDiasCustom: form.intervaloDiasCustom || undefined,
          custoPrevisto: form.custoPrevisto || undefined,
          responsavelId: form.responsavelId || undefined,
          prestadorId: form.prestadorId || undefined,
          checklist,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao programar manutenção preventiva.");
      }
      reset();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao programar manutenção preventiva.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Programar manutenção preventiva" widthClass="max-w-xl">
      <FormError message={error} />
      <div className="space-y-4">
        {!presetEquipamentoId && (
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Equipamento *</label>
            <select className="input w-full" value={form.equipamentoId} onChange={(e) => set("equipamentoId", e.target.value)}>
              <option value="">Selecione...</option>
              {equipamentos.map((e) => (
                <option key={e.id} value={e.id}>{e.nome} ({e.codigo})</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="text-xs text-nord-gray mb-1 block">Tipo de serviço *</label>
          <input className="input w-full" value={form.tipoServico} onChange={(e) => set("tipoServico", e.target.value)} placeholder="Ex.: Limpeza do sistema de refrigeração" />
        </div>
        <div>
          <label className="text-xs text-nord-gray mb-1 block">Descrição</label>
          <textarea className="input w-full min-h-[60px]" value={form.descricao} onChange={(e) => set("descricao", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Frequência</label>
            <select className="input w-full" value={form.frequencia} onChange={(e) => set("frequencia", e.target.value)}>
              {MANUTENCAO_FREQUENCIA_OPTIONS.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
          </div>
          {form.frequencia === "PERSONALIZADA" && (
            <div>
              <label className="text-xs text-nord-gray mb-1 block">Repetir a cada (dias)</label>
              <input type="number" min={1} className="input w-full" value={form.intervaloDiasCustom} onChange={(e) => set("intervaloDiasCustom", e.target.value)} />
            </div>
          )}
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Data de início *</label>
            <input type="date" className="input w-full" value={form.dataInicio} onChange={(e) => set("dataInicio", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Horário</label>
            <input type="time" className="input w-full" value={form.horario} onChange={(e) => set("horario", e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Responsável interno</label>
            <select className="input w-full" value={form.responsavelId} onChange={(e) => set("responsavelId", e.target.value)}>
              <option value="">A definir</option>
              {teamMembers.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Prestador</label>
            <select className="input w-full" value={form.prestadorId} onChange={(e) => set("prestadorId", e.target.value)}>
              <option value="">Nenhum</option>
              {prestadores.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 items-end">
          <div>
            <label className="text-xs text-nord-gray mb-1 block">Custo previsto</label>
            <input type="number" step="0.01" className="input w-full" value={form.custoPrevisto} onChange={(e) => set("custoPrevisto", e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-white pb-2">
            <input type="checkbox" checked={form.necessidadeParada} onChange={(e) => set("necessidadeParada", e.target.checked)} />
            Exige parada do equipamento
          </label>
        </div>

        <div>
          <label className="text-xs text-nord-gray mb-1 block">Checklist do serviço</label>
          <div className="flex gap-2 mb-2">
            <input
              className="input flex-1"
              placeholder="Adicionar passo..."
              value={checklistDraft}
              onChange={(e) => setChecklistDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addChecklistItem())}
            />
            <button className="btn-outline" onClick={addChecklistItem} type="button">
              <Plus size={14} />
            </button>
          </div>
          {checklist.length > 0 && (
            <div className="space-y-1">
              {checklist.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs bg-nord-panel border border-nord-border rounded-lg px-2 py-1.5">
                  <span className="text-white">{item}</span>
                  <button onClick={() => setChecklist((prev) => prev.filter((_, i) => i !== idx))} className="text-nord-gray hover:text-red-400">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-outline" onClick={handleClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? "Salvando..." : "Programar preventiva"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
