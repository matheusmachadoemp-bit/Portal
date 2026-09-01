"use client";

import { useState } from "react";
import { Plus, X, Upload as UploadIcon } from "lucide-react";
import { upload } from "@vercel/blob/client";
import { sanitizeFileName } from "@/lib/upload";
import { Modal, FormError } from "@/components/ui/modal";
import {
  TASK_SECTORS,
  TASK_PRIORITY_OPTIONS,
  TASK_PROOF_TYPE_OPTIONS,
  TASK_RECURRENCE_FREQ_OPTIONS,
  WEEKDAY_LABELS,
} from "@/lib/tarefas";
import type { EmpresaOption, UserOption } from "./types";

type AttachmentDraft = { name: string; fileUrl: string; mimeType?: string; sizeBytes?: number };

const emptyForm = () => ({
  title: "",
  description: "",
  empresaIds: [] as string[],
  sectorKey: TASK_SECTORS[0] as string,
  assigneeIds: [] as string[],
  priority: "MEDIA",
  startDate: "",
  dueDate: "",
  dueTime: "",
  recurrenceFreq: "NENHUMA",
  recurrenceWeekdays: [] as number[],
  recurrenceIntervalDays: "1",
  recurrenceDayOfMonth: "1",
  proofType: "NENHUMA",
  requiresValidation: false,
  validatorId: "",
  checklist: [] as string[],
  attachments: [] as AttachmentDraft[],
});

export function TaskFormModal({
  open,
  onClose,
  onCreated,
  users,
  empresas,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  users: UserOption[];
  empresas: EmpresaOption[];
}) {
  const [form, setForm] = useState(emptyForm());
  const [checklistDraft, setChecklistDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ReturnType<typeof emptyForm>>(key: K, value: ReturnType<typeof emptyForm>[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleInArray(key: "empresaIds" | "assigneeIds" | "recurrenceWeekdays", value: string | number) {
    setForm((f) => {
      const arr = f[key] as (string | number)[];
      const has = arr.includes(value as never);
      return { ...f, [key]: has ? arr.filter((v) => v !== value) : [...arr, value] } as typeof f;
    });
  }

  function reset() {
    setForm(emptyForm());
    setChecklistDraft("");
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function addChecklistItem() {
    if (!checklistDraft.trim()) return;
    set("checklist", [...form.checklist, checklistDraft.trim()]);
    setChecklistDraft("");
  }

  function removeChecklistItem(idx: number) {
    set(
      "checklist",
      form.checklist.filter((_, i) => i !== idx)
    );
  }

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(fileList)) {
        const blob = await upload(sanitizeFileName(file.name), file, { access: "public", handleUploadUrl: "/api/upload" });
        set("attachments", [...form.attachments, { name: file.name, fileUrl: blob.url, mimeType: file.type, sizeBytes: file.size }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar o anexo.");
    } finally {
      setUploading(false);
    }
  }

  function removeAttachment(idx: number) {
    set(
      "attachments",
      form.attachments.filter((_, i) => i !== idx)
    );
  }

  const effectiveEmpresaIds = empresas.length <= 1 ? empresas.map((e) => e.id) : form.empresaIds;

  async function handleSubmit() {
    setError(null);
    if (!form.title.trim()) return setError("Informe o título da tarefa.");
    if (effectiveEmpresaIds.length === 0) return setError("Selecione ao menos uma unidade.");
    if (!form.sectorKey) return setError("Selecione o setor.");
    if (form.requiresValidation && !form.validatorId) return setError("Selecione quem vai validar a tarefa.");

    setSaving(true);
    try {
      const recurrenceConfig =
        form.recurrenceFreq === "SEMANAL"
          ? { weekdays: form.recurrenceWeekdays }
          : form.recurrenceFreq === "PERSONALIZADA"
            ? { intervalDays: Number(form.recurrenceIntervalDays) || 1 }
            : form.recurrenceFreq === "MENSAL"
              ? { dayOfMonth: Number(form.recurrenceDayOfMonth) || 1 }
              : undefined;

      const res = await fetch("/api/tarefas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          empresaIds: effectiveEmpresaIds,
          sectorKey: form.sectorKey,
          assigneeIds: form.assigneeIds,
          priority: form.priority,
          startDate: form.startDate || undefined,
          dueDate: form.dueDate || undefined,
          dueTime: form.dueTime || undefined,
          recurrenceFreq: form.recurrenceFreq,
          recurrenceConfig,
          proofType: form.proofType,
          requiresValidation: form.requiresValidation,
          validatorId: form.requiresValidation ? form.validatorId : undefined,
          checklist: form.checklist,
          attachments: form.attachments,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Não foi possível criar a tarefa.");
      }
      reset();
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar a tarefa.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Nova tarefa" widthClass="max-w-2xl">
      <FormError message={error} />

      <div className="space-y-4">
        <div>
          <span className="block text-xs text-nord-gray mb-1">Título</span>
          <input value={form.title} onChange={(e) => set("title", e.target.value)} className="input w-full" placeholder="Ex: Conferir estoque de bebidas" />
        </div>

        <div>
          <span className="block text-xs text-nord-gray mb-1">Descrição</span>
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            className="input w-full min-h-[70px]"
            placeholder="Detalhe o que precisa ser feito (opcional)"
          />
        </div>

        {empresas.length > 1 && (
          <div>
            <span className="block text-xs text-nord-gray mb-1">Unidade</span>
            <div className="flex flex-wrap gap-2">
              {empresas.map((e) => (
                <label
                  key={e.id}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer ${
                    form.empresaIds.includes(e.id) ? "border-nord-blue text-white" : "border-nord-border text-nord-gray"
                  }`}
                >
                  <input type="checkbox" className="hidden" checked={form.empresaIds.includes(e.id)} onChange={() => toggleInArray("empresaIds", e.id)} />
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: e.color }} />
                  {e.name}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="block text-xs text-nord-gray mb-1">Setor</span>
            <select value={form.sectorKey} onChange={(e) => set("sectorKey", e.target.value)} className="input w-full">
              {TASK_SECTORS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="block text-xs text-nord-gray mb-1">Prioridade</span>
            <select value={form.priority} onChange={(e) => set("priority", e.target.value)} className="input w-full">
              {TASK_PRIORITY_OPTIONS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.emoji} {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <span className="block text-xs text-nord-gray mb-1">Responsável(is)</span>
          <div className="max-h-32 overflow-y-auto nord-scrollbar border border-nord-border rounded-lg p-2 flex flex-wrap gap-1.5">
            {users.map((u) => (
              <label
                key={u.id}
                className={`px-2.5 py-1 rounded-full border text-xs cursor-pointer ${
                  form.assigneeIds.includes(u.id) ? "border-nord-blue text-white bg-nord-blue/10" : "border-nord-border text-nord-gray"
                }`}
              >
                <input type="checkbox" className="hidden" checked={form.assigneeIds.includes(u.id)} onChange={() => toggleInArray("assigneeIds", u.id)} />
                {u.name}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <span className="block text-xs text-nord-gray mb-1">Início</span>
            <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className="input w-full" />
          </div>
          <div>
            <span className="block text-xs text-nord-gray mb-1">Prazo</span>
            <input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} className="input w-full" />
          </div>
          <div>
            <span className="block text-xs text-nord-gray mb-1">Hora</span>
            <input type="time" value={form.dueTime} onChange={(e) => set("dueTime", e.target.value)} className="input w-full" />
          </div>
        </div>

        <div>
          <span className="block text-xs text-nord-gray mb-1">Recorrência</span>
          <select value={form.recurrenceFreq} onChange={(e) => set("recurrenceFreq", e.target.value)} className="input w-full">
            {TASK_RECURRENCE_FREQ_OPTIONS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
          {form.recurrenceFreq === "SEMANAL" && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {WEEKDAY_LABELS.map((label, idx) => (
                <label
                  key={idx}
                  className={`px-2.5 py-1 rounded-full border text-xs cursor-pointer ${
                    form.recurrenceWeekdays.includes(idx) ? "border-nord-blue text-white bg-nord-blue/10" : "border-nord-border text-nord-gray"
                  }`}
                >
                  <input type="checkbox" className="hidden" checked={form.recurrenceWeekdays.includes(idx)} onChange={() => toggleInArray("recurrenceWeekdays", idx)} />
                  {label}
                </label>
              ))}
            </div>
          )}
          {form.recurrenceFreq === "PERSONALIZADA" && (
            <input
              type="number"
              min={1}
              value={form.recurrenceIntervalDays}
              onChange={(e) => set("recurrenceIntervalDays", e.target.value)}
              placeholder="Repetir a cada N dias"
              className="input w-full mt-2"
            />
          )}
          {form.recurrenceFreq === "MENSAL" && (
            <input
              type="number"
              min={1}
              max={31}
              value={form.recurrenceDayOfMonth}
              onChange={(e) => set("recurrenceDayOfMonth", e.target.value)}
              placeholder="Dia do mês"
              className="input w-full mt-2"
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="block text-xs text-nord-gray mb-1">Tipo de comprovação</span>
            <select value={form.proofType} onChange={(e) => set("proofType", e.target.value)} className="input w-full">
              {TASK_PROOF_TYPE_OPTIONS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col justify-end">
            <label className="flex items-center gap-2 text-sm text-white pb-2 cursor-pointer">
              <input type="checkbox" checked={form.requiresValidation} onChange={(e) => set("requiresValidation", e.target.checked)} />
              Exige validação
            </label>
          </div>
        </div>

        {form.requiresValidation && (
          <div>
            <span className="block text-xs text-nord-gray mb-1">Validador</span>
            <select value={form.validatorId} onChange={(e) => set("validatorId", e.target.value)} className="input w-full">
              <option value="">Selecione...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <span className="block text-xs text-nord-gray mb-1">Checklist</span>
          <div className="flex gap-2 mb-2">
            <input
              value={checklistDraft}
              onChange={(e) => setChecklistDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addChecklistItem();
                }
              }}
              placeholder="Adicionar item..."
              className="input flex-1"
            />
            <button type="button" onClick={addChecklistItem} className="btn-outline">
              <Plus size={14} />
            </button>
          </div>
          {form.checklist.length > 0 && (
            <ul className="space-y-1">
              {form.checklist.map((item, idx) => (
                <li key={idx} className="flex items-center justify-between text-xs bg-white/5 rounded-lg px-2.5 py-1.5">
                  <span className="text-white">{item}</span>
                  <button type="button" onClick={() => removeChecklistItem(idx)} className="text-nord-gray hover:text-red-400">
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <span className="block text-xs text-nord-gray mb-1">Anexos</span>
          <label className="btn-outline inline-flex cursor-pointer w-fit">
            <UploadIcon size={13} /> {uploading ? "Enviando..." : "Adicionar arquivo"}
            <input type="file" multiple hidden onChange={(e) => handleUpload(e.target.files)} disabled={uploading} />
          </label>
          {form.attachments.length > 0 && (
            <ul className="space-y-1 mt-2">
              {form.attachments.map((a, idx) => (
                <li key={idx} className="flex items-center justify-between text-xs bg-white/5 rounded-lg px-2.5 py-1.5">
                  <span className="text-white truncate max-w-[80%]">{a.name}</span>
                  <button type="button" onClick={() => removeAttachment(idx)} className="text-nord-gray hover:text-red-400">
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={handleClose} className="px-4 py-2 text-sm rounded-lg border border-nord-border text-nord-gray hover:text-white">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? "Criando..." : "Criar tarefa"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
