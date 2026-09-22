"use client";

import { useState } from "react";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { ProgressBar } from "@/components/ui/stat-card";
import { Plus, Trash2, Send } from "lucide-react";
import {
  KANBAN_COLUMNS,
  PRIORITY_OPTIONS,
  CATEGORY_OPTIONS,
  FORMAT_OPTIONS,
  SOCIAL_NETWORK_OPTIONS,
  DEFAULT_CHECKLIST,
  parseChecklist,
  type ChecklistItem,
} from "@/lib/marketing";
import type { TaskDTO, TeamMember } from "./marketing-types";

export function TaskModal({
  open,
  onClose,
  onSaved,
  onDeleted,
  task,
  teamMembers,
  defaultDate,
  canDelete = false,
  // Padrão `true`: este modal também é usado em Dashboard e Calendário de Marketing, que
  // ainda não calculam essa permissão e não devem perder a possibilidade de salvar por causa
  // disso — só a tela de Tarefas (Kanban) hoje passa o valor real calculado a partir de
  // `hasModulePermission(..., "canEdit")`. Ver task #298.
  canEdit = true,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
  task?: TaskDTO | null;
  teamMembers: TeamMember[];
  defaultDate?: string;
  canDelete?: boolean;
  canEdit?: boolean;
}) {
  // Sem efeito de sincronização: quem chama este modal remonta o
  // componente (via `key`) toda vez que ele abre pra uma tarefa (nova ou
  // existente), então todo o estado abaixo já nasce certo a partir da
  // prop `task`.
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [objetivo, setObjetivo] = useState(task?.objetivo ?? "");
  const [category, setCategory] = useState(task?.category ?? "");
  const [socialNetwork, setSocialNetwork] = useState(task?.socialNetwork ?? "");
  const [format, setFormat] = useState(task?.format ?? "");
  const [status, setStatus] = useState(task?.status ?? "A_PRODUZIR");
  const [priority, setPriority] = useState(task?.priority ?? "MEDIA");
  const [date, setDate] = useState(task?.date ? task.date.slice(0, 10) : defaultDate ?? "");
  const [time, setTime] = useState(task?.time ?? "");
  const [responsavelId, setResponsavelId] = useState(task?.responsavelId ?? "");
  const [tags, setTags] = useState(task?.tags ?? "");
  const [checklist, setChecklist] = useState<ChecklistItem[]>(
    task ? parseChecklist(task.checklist) : DEFAULT_CHECKLIST.map((t) => ({ text: t, done: false }))
  );
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState(task?.comments ?? []);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const doneCount = checklist.filter((c) => c.done).length;
  const progress = checklist.length ? Math.round((doneCount / checklist.length) * 100) : 0;

  // Criar uma tarefa nova (task === null) já só é possível pra quem tem canCreate — o botão
  // "Nova tarefa"/"Novo conteúdo" que abre este modal nesse modo já é escondido por quem
  // chama (tasks-client.tsx, dashboard-client.tsx, calendar-client.tsx). Editar uma já
  // existente é que precisa da checagem de canEdit aqui dentro.
  const canSave = !task || canEdit;

  function toggleChecklistItem(idx: number) {
    setChecklist((prev) => prev.map((c, i) => (i === idx ? { ...c, done: !c.done } : c)));
  }

  function addChecklistItem() {
    if (!newChecklistItem.trim()) return;
    setChecklist((prev) => [...prev, { text: newChecklistItem.trim(), done: false }]);
    setNewChecklistItem("");
  }

  function removeChecklistItem(idx: number) {
    setChecklist((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submit() {
    if (saving) return;
    if (!title.trim()) return;
    if (!canSave) return;
    setSaving(true);
    try {
      const payload = {
        title,
        description,
        objetivo,
        category: category || null,
        socialNetwork: socialNetwork || null,
        format: format || null,
        status,
        priority,
        date: date || null,
        time: time || null,
        responsavelId: responsavelId || null,
        tags,
        checklist: JSON.stringify(checklist),
      };
      if (task) {
        await fetch(`/api/marketing/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch("/api/marketing/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function sendComment() {
    if (!task || !comment.trim()) return;
    const res = await fetch(`/api/marketing/tasks/${task.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: comment }),
    });
    const data = await res.json();
    if (data.comment) setComments((prev) => [...prev, data.comment]);
    setComment("");
  }

  async function doDelete() {
    if (!task || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/marketing/tasks/${task.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error ?? "Não foi possível excluir esta tarefa.");
        return;
      }
      setConfirmDelete(false);
      setDeleteError(null);
      onDeleted?.();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={task ? "Editar conteúdo/tarefa" : "Novo conteúdo/tarefa"} widthClass="max-w-3xl">
      <div className="space-y-4">
        <label className="block">
          <span className="block text-xs text-nord-gray mb-1">Título</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="Ex: Reels — Lançamento Pizza Marguerita" />
        </label>

        <label className="block">
          <span className="block text-xs text-nord-gray mb-1">Descrição</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input min-h-16" />
        </label>

        <label className="block">
          <span className="block text-xs text-nord-gray mb-1">Objetivo</span>
          <input value={objetivo} onChange={(e) => setObjetivo(e.target.value)} className="input" />
        </label>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Categoria</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
              <option value="">—</option>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Formato</span>
            <select value={format} onChange={(e) => setFormat(e.target.value)} className="input">
              <option value="">—</option>
              {FORMAT_OPTIONS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Rede social</span>
            <select value={socialNetwork} onChange={(e) => setSocialNetwork(e.target.value)} className="input">
              <option value="">—</option>
              {SOCIAL_NETWORK_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Prioridade</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="input">
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="input">
              {KANBAN_COLUMNS.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Data</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Hora</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-nord-gray mb-1">Responsável</span>
            <select value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)} className="input">
              <option value="">—</option>
              {teamMembers.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="block text-xs text-nord-gray mb-1">Etiquetas (separadas por vírgula)</span>
          <input value={tags} onChange={(e) => setTags(e.target.value)} className="input" placeholder="promoção, verão" />
        </label>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-nord-gray">Checklist de produção</span>
            <span className="text-xs text-nord-gray">{progress}%</span>
          </div>
          <ProgressBar percent={progress} />
          <div className="mt-2 space-y-1.5">
            {checklist.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input type="checkbox" checked={item.done} onChange={() => toggleChecklistItem(idx)} className="accent-nord-blue" />
                <span className={`text-sm flex-1 ${item.done ? "text-nord-gray line-through" : "text-white"}`}>{item.text}</span>
                <button onClick={() => removeChecklistItem(idx)} className="text-nord-gray hover:text-nord-danger">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <input
              value={newChecklistItem}
              onChange={(e) => setNewChecklistItem(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addChecklistItem()}
              placeholder="Adicionar item..."
              className="input flex-1"
            />
            <button onClick={addChecklistItem} className="text-nord-blue-light hover:text-white">
              <Plus size={16} />
            </button>
          </div>
        </div>

        {task && (
          <div>
            <span className="block text-xs text-nord-gray mb-1.5">Comentários</span>
            <div className="space-y-2 max-h-40 overflow-y-auto nord-scrollbar mb-2">
              {comments.length === 0 && <p className="text-xs text-nord-gray">Nenhum comentário ainda.</p>}
              {comments.map((c) => (
                <div key={c.id} className="text-xs bg-nord-panel rounded-lg px-3 py-2">
                  <span className="text-white font-medium">{c.author.name}: </span>
                  <span className="text-nord-gray">{c.text}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendComment()}
                placeholder="Escrever comentário..."
                className="input flex-1"
              />
              <button onClick={sendComment} className="text-nord-blue-light hover:text-white">
                <Send size={16} />
              </button>
            </div>
          </div>
        )}

        {task && !canEdit && (
          <p className="text-xs text-nord-warning">Seu perfil de permissão só permite visualizar esta tarefa.</p>
        )}

        <div className="flex items-center gap-2">
          {task && canDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-nord-danger/15 text-nord-danger hover:bg-nord-danger/25 disabled:opacity-50"
            >
              <Trash2 size={14} />
              Excluir
            </button>
          )}
          {canSave && (
            <button
              onClick={submit}
              disabled={!title.trim() || saving}
              className="flex-1 bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          )}
        </div>
      </div>

      {task && (
        <ConfirmDialog
          open={confirmDelete}
          title="Excluir tarefa"
          message={
            deleteError ?? `Tem certeza que deseja excluir "${task.title}"? Essa ação não pode ser desfeita.`
          }
          onConfirm={doDelete}
          onCancel={() => {
            setConfirmDelete(false);
            setDeleteError(null);
          }}
          confirmLabel={deleting ? "Excluindo..." : deleteError ? "Tentar novamente" : "Excluir"}
          danger
        />
      )}
    </Modal>
  );
}
