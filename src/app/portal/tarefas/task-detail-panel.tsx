"use client";

import { useState } from "react";
import { Check, Upload as UploadIcon, X } from "lucide-react";
import { upload } from "@vercel/blob/client";
import { sanitizeFileName } from "@/lib/upload";
import { Modal, FormError } from "@/components/ui/modal";
import { Badge, ProgressBar } from "@/components/ui/stat-card";
import { SectorBadge } from "./sector-badge";
import { ResponsavelBadge } from "./responsavel-badge";
import {
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_COLOR,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  TASK_PROOF_TYPE_LABEL,
  describeTaskHistoryAction,
  effectiveTaskStatus,
} from "@/lib/tarefas";

type FullTask = {
  id: string;
  title: string;
  description: string | null;
  sectorKey: string;
  priority: "URGENTE" | "ALTA" | "MEDIA" | "BAIXA";
  status: "PENDENTE" | "EM_ANDAMENTO" | "AGUARDANDO_VALIDACAO" | "CONCLUIDA";
  dueDate: string | null;
  dueTime: string | null;
  proofType: "NENHUMA" | "FOTO" | "ARQUIVO" | "TEXTO" | "FOTO_TEXTO";
  requiresValidation: boolean;
  validatorId: string | null;
  validator: { id: string; name: string } | null;
  createdBy: { id: string; name: string };
  empresa: { id: string; name: string; color: string };
  overdue: boolean;
  assignees: { id: string; userId: string; user: { id: string; name: string } }[];
  checklist: { id: string; text: string; done: boolean; doneById: string | null }[];
  comments: { id: string; text: string; createdAt: string; author: { id: string; name: string } }[];
  attachments: { id: string; name: string; fileUrl: string; createdAt: string; uploadedBy: { name: string } }[];
  proofs: { id: string; text: string | null; fileUrl: string | null; createdAt: string; submittedBy: { name: string } }[];
  validations: { id: string; approved: boolean; reason: string | null; createdAt: string; validator: { name: string } }[];
  history: { id: string; action: string; detail: string | null; createdAt: string; user: { name: string } | null }[];
};

export function TaskDetailPanel({
  taskId,
  onClose,
  onChanged,
  currentUserId,
}: {
  taskId: string | null;
  onClose: () => void;
  onChanged: () => void;
  currentUserId: string;
}) {
  const [task, setTask] = useState<FullTask | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [checklistDraft, setChecklistDraft] = useState("");
  const [proofText, setProofText] = useState("");
  const [proofFile, setProofFile] = useState<{ fileUrl: string; mimeType: string } | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tarefas/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível carregar a tarefa.");
      setTask(data.task);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar a tarefa.");
    } finally {
      setLoading(false);
    }
  }

  if (taskId && (!task || task.id !== taskId) && !loading) {
    load(taskId);
  }

  function handleClose() {
    setTask(null);
    setCommentDraft("");
    setChecklistDraft("");
    setProofText("");
    setProofFile(null);
    setShowRejectBox(false);
    setRejectReason("");
    onClose();
  }

  async function reload() {
    if (task) await load(task.id);
    onChanged();
  }

  async function handleIniciar() {
    if (!task) return;
    setBusy(true);
    try {
      await fetch(`/api/tarefas/${task.id}/iniciar`, { method: "POST" });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function toggleChecklistItem(itemId: string, done: boolean) {
    if (!task) return;
    await fetch(`/api/tarefas/${task.id}/checklist/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    await reload();
  }

  async function addChecklistItem() {
    if (!task || !checklistDraft.trim()) return;
    await fetch(`/api/tarefas/${task.id}/checklist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: checklistDraft.trim() }),
    });
    setChecklistDraft("");
    await reload();
  }

  async function handleProofUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploadingProof(true);
    try {
      const file = fileList[0];
      const blob = await upload(sanitizeFileName(file.name), file, { access: "public", handleUploadUrl: "/api/upload" });
      setProofFile({ fileUrl: blob.url, mimeType: file.type });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar o arquivo.");
    } finally {
      setUploadingProof(false);
    }
  }

  async function handleComprovar() {
    if (!task) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/tarefas/${task.id}/comprovar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: proofText || undefined, fileUrl: proofFile?.fileUrl, mimeType: proofFile?.mimeType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível enviar a comprovação.");
      setProofText("");
      setProofFile(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar a comprovação.");
    } finally {
      setBusy(false);
    }
  }

  async function handleValidar(approved: boolean) {
    if (!task) return;
    if (!approved && !rejectReason.trim()) {
      setShowRejectBox(true);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/tarefas/${task.id}/validar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved, reason: approved ? undefined : rejectReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível validar a tarefa.");
      setShowRejectBox(false);
      setRejectReason("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível validar a tarefa.");
    } finally {
      setBusy(false);
    }
  }

  async function handleComment() {
    if (!task || !commentDraft.trim()) return;
    await fetch(`/api/tarefas/${task.id}/comentarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: commentDraft.trim() }),
    });
    setCommentDraft("");
    await reload();
  }

  if (!taskId) return null;

  const status = task ? effectiveTaskStatus(task) : null;
  const checklistDone = task ? task.checklist.filter((c) => c.done).length : 0;
  const checklistTotal = task?.checklist.length ?? 0;
  const canValidate = task && task.status === "AGUARDANDO_VALIDACAO" && task.validatorId === currentUserId;
  const isAssignee = task ? task.assignees.some((a) => a.userId === currentUserId) : false;

  return (
    <Modal open={!!taskId} onClose={handleClose} title={task?.title ?? "Tarefa"} widthClass="max-w-2xl">
      <FormError message={error} />
      {loading && !task && <p className="text-sm text-nord-gray">Carregando...</p>}

      {task && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={TASK_STATUS_TONE[status!]}>{TASK_STATUS_LABEL[status!]}</Badge>
            <span className="text-xs" style={{ color: TASK_PRIORITY_COLOR[task.priority] }}>
              {TASK_PRIORITY_LABEL[task.priority]}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-nord-gray">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: task.empresa.color }} />
              {task.empresa.name}
            </span>
            <SectorBadge sectorKey={task.sectorKey} />
            {task.dueDate && (
              <span className={`text-xs ${task.overdue ? "text-red-400 font-medium" : "text-nord-gray"}`}>
                Prazo: {new Date(task.dueDate).toLocaleDateString("pt-BR")}
                {task.dueTime ? ` ${task.dueTime}` : ""}
              </span>
            )}
          </div>

          {task.description && <p className="text-sm text-nord-gray whitespace-pre-wrap">{task.description}</p>}

          <div className="flex flex-wrap items-center gap-1.5 text-xs text-nord-gray">
            <span>Criada por {task.createdBy.name} · Responsáveis:</span>
            {task.assignees.length === 0 ? (
              <span>ninguém atribuído</span>
            ) : (
              task.assignees.map((a) => <ResponsavelBadge key={a.userId} userId={a.userId} name={a.user.name} />)
            )}
            {task.requiresValidation && task.validator && <span>· Validador: {task.validator.name}</span>}
          </div>

          {task.status === "PENDENTE" && isAssignee && (
            <button onClick={handleIniciar} disabled={busy} className="btn-primary disabled:opacity-50">
              Iniciar tarefa
            </button>
          )}

          {task.checklist.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-white font-medium">Checklist</p>
                <span className="text-xs text-nord-gray">
                  {checklistDone}/{checklistTotal}
                </span>
              </div>
              <ProgressBar percent={checklistTotal ? (checklistDone / checklistTotal) * 100 : 0} />
              <ul className="mt-3 space-y-1.5">
                {task.checklist.map((item) => (
                  <li key={item.id} className="flex items-center gap-2">
                    <button
                      onClick={() => toggleChecklistItem(item.id, !item.done)}
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        item.done ? "bg-nord-blue border-nord-blue" : "border-nord-border"
                      }`}
                    >
                      {item.done && <Check size={11} className="text-white" />}
                    </button>
                    <span className={`text-sm ${item.done ? "text-nord-gray line-through" : "text-white"}`}>{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {task.status !== "PENDENTE" && task.status !== "CONCLUIDA" && (
            <div>
              {task.checklist.length === 0 && (
                <div className="flex gap-2 mb-3">
                  <input
                    value={checklistDraft}
                    onChange={(e) => setChecklistDraft(e.target.value)}
                    placeholder="Adicionar item ao checklist (opcional)"
                    className="input flex-1"
                  />
                  <button onClick={addChecklistItem} className="btn-outline">
                    Adicionar
                  </button>
                </div>
              )}

              {task.status === "EM_ANDAMENTO" && isAssignee && (
                <div className="nord-card p-3 space-y-2">
                  <p className="text-sm text-white font-medium">Comprovar execução</p>
                  {task.proofType === "NENHUMA" && <p className="text-xs text-nord-gray">Esta tarefa não exige comprovação.</p>}
                  {(task.proofType === "TEXTO" || task.proofType === "FOTO_TEXTO") && (
                    <textarea
                      value={proofText}
                      onChange={(e) => setProofText(e.target.value)}
                      placeholder="Descreva a execução..."
                      className="input w-full min-h-[60px]"
                    />
                  )}
                  {(task.proofType === "FOTO" || task.proofType === "ARQUIVO" || task.proofType === "FOTO_TEXTO") && (
                    <div>
                      <label className="btn-outline inline-flex cursor-pointer w-fit">
                        <UploadIcon size={13} /> {uploadingProof ? "Enviando..." : proofFile ? "Arquivo enviado ✓" : "Anexar arquivo"}
                        <input type="file" hidden onChange={(e) => handleProofUpload(e.target.files)} disabled={uploadingProof} />
                      </label>
                    </div>
                  )}
                  <button onClick={handleComprovar} disabled={busy} className="btn-primary disabled:opacity-50">
                    Enviar comprovação
                  </button>
                </div>
              )}
            </div>
          )}

          {task.proofs.length > 0 && (
            <div>
              <p className="text-sm text-white font-medium mb-2">Comprovações</p>
              <ul className="space-y-2">
                {task.proofs.map((p) => (
                  <li key={p.id} className="text-xs bg-white/5 rounded-lg p-2.5">
                    <p className="text-nord-gray">
                      {p.submittedBy.name} · {new Date(p.createdAt).toLocaleString("pt-BR")}
                    </p>
                    {p.text && <p className="text-white mt-1">{p.text}</p>}
                    {p.fileUrl && (
                      <a href={p.fileUrl} target="_blank" rel="noreferrer" className="text-nord-blue-light hover:underline mt-1 inline-block">
                        Ver arquivo
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canValidate && (
            <div className="nord-card p-3 space-y-2">
              <p className="text-sm text-white font-medium">Validação</p>
              {!showRejectBox ? (
                <div className="flex gap-2">
                  <button onClick={() => handleValidar(true)} disabled={busy} className="btn-primary disabled:opacity-50">
                    Aprovar
                  </button>
                  <button
                    onClick={() => setShowRejectBox(true)}
                    disabled={busy}
                    className="px-4 py-2 text-sm rounded-lg border border-red-900 text-red-400 hover:bg-red-950/40"
                  >
                    Reprovar
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Motivo da reprovação (obrigatório)"
                    className="input w-full min-h-[60px]"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => handleValidar(false)} disabled={busy || !rejectReason.trim()} className="btn-primary disabled:opacity-50 bg-red-600 hover:bg-red-500">
                      Confirmar reprovação
                    </button>
                    <button onClick={() => setShowRejectBox(false)} className="btn-outline">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {task.validations.length > 0 && (
            <div>
              <p className="text-sm text-white font-medium mb-2">Histórico de validações</p>
              <ul className="space-y-1.5">
                {task.validations.map((v) => (
                  <li key={v.id} className="text-xs">
                    <Badge tone={v.approved ? "success" : "danger"}>{v.approved ? "Aprovada" : "Reprovada"}</Badge>{" "}
                    <span className="text-nord-gray">
                      por {v.validator.name} em {new Date(v.createdAt).toLocaleString("pt-BR")}
                    </span>
                    {v.reason && <p className="text-nord-gray mt-0.5">Motivo: {v.reason}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {task.attachments.length > 0 && (
            <div>
              <p className="text-sm text-white font-medium mb-2">Anexos</p>
              <ul className="space-y-1">
                {task.attachments.map((a) => (
                  <li key={a.id}>
                    <a href={a.fileUrl} target="_blank" rel="noreferrer" className="text-xs text-nord-blue-light hover:underline">
                      {a.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="text-sm text-white font-medium mb-2">Comentários</p>
            {task.comments.length > 0 && (
              <ul className="space-y-2 mb-3">
                {task.comments.map((c) => (
                  <li key={c.id} className="text-xs bg-white/5 rounded-lg p-2.5">
                    <p className="text-nord-gray">
                      {c.author.name} · {new Date(c.createdAt).toLocaleString("pt-BR")}
                    </p>
                    <p className="text-white mt-1">{c.text}</p>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <input
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleComment();
                  }
                }}
                placeholder="Escreva um comentário..."
                className="input flex-1"
              />
              <button onClick={handleComment} className="btn-outline">
                Enviar
              </button>
            </div>
          </div>

          {task.history.length > 0 && (
            <div>
              <p className="text-sm text-white font-medium mb-2">Histórico</p>
              <ul className="space-y-1">
                {task.history.map((h) => (
                  <li key={h.id} className="text-xs text-nord-gray">
                    <span className="text-white">{h.user?.name ?? "Sistema"}</span> {describeTaskHistoryAction(h.action, h.detail)} —{" "}
                    {new Date(h.createdAt).toLocaleString("pt-BR")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
