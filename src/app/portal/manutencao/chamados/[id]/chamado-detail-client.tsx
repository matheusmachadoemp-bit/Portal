"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Upload as UploadIcon, Send } from "lucide-react";
import { upload } from "@vercel/blob/client";
import { sanitizeFileName } from "@/lib/upload";
import { Section, Badge } from "@/components/ui/stat-card";
import { FormError } from "@/components/ui/modal";
import {
  CHAMADO_CATEGORIA_LABEL,
  CHAMADO_PRIORIDADE_COLOR,
  CHAMADO_PRIORIDADE_LABEL,
  CHAMADO_STATUS_COLOR,
  CHAMADO_STATUS_LABEL,
  KANBAN_COLUMNS,
  ORCAMENTO_STATUS_LABEL,
  ORCAMENTO_STATUS_TONE,
  describeChamadoHistoricoAction,
} from "@/lib/manutencao";
import { formatCurrency } from "@/lib/calc";
import { ManutencaoRegistroModal } from "../../manutencao-registro-modal";
import { OrcamentoFormModal } from "../../orcamento-form-modal";
import type { ChamadoDTO, AnexoDraft } from "../../types";

const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

type UserOption = { id: string; name: string };
type PrestadorOption = { id: string; nome: string };

export function ChamadoDetailClient({
  chamado,
  teamMembers,
  prestadores,
  currentUserId,
  currentUserRole,
}: {
  chamado: ChamadoDTO;
  teamMembers: UserOption[];
  prestadores: PrestadorOption[];
  currentUserId: string;
  currentUserRole: string;
}) {
  const [comentarios, setComentarios] = useState(chamado.comentarios ?? []);
  const [anexos, setAnexos] = useState(chamado.anexos ?? []);
  const [orcamentos, setOrcamentos] = useState(chamado.orcamentos ?? []);
  const [showOrcamentoModal, setShowOrcamentoModal] = useState(false);
  const [recusaDraft, setRecusaDraft] = useState<Record<string, string>>({});
  const [comentario, setComentario] = useState("");
  const [descricaoSolucao, setDescricaoSolucao] = useState(chamado.descricaoSolucao ?? "");
  const [responsavelId, setResponsavelId] = useState(chamado.responsavelId ?? "");
  const [prazo, setPrazo] = useState(chamado.prazo ? chamado.prazo.slice(0, 10) : "");
  const [showRegistro, setShowRegistro] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const canManage = MANAGER_ROLES.includes(currentUserRole) || chamado.solicitanteId === currentUserId;
  const overdue = !!chamado.prazo && chamado.status !== "RESOLVIDO" && chamado.status !== "CANCELADO" && new Date(chamado.prazo) < new Date();

  async function patchChamado(body: Record<string, unknown>) {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/manutencao/chamados/${chamado.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao atualizar chamado.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar chamado.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status: string) {
    if (status === "RESOLVIDO" && !descricaoSolucao.trim()) {
      setError("Descreva a solução aplicada antes de resolver o chamado.");
      return;
    }
    await patchChamado({ status, descricaoSolucao: descricaoSolucao || undefined });
  }

  async function saveResponsavelPrazo() {
    await patchChamado({ responsavelId: responsavelId || null, prazo: prazo || null });
  }

  async function sendComentario() {
    if (!comentario.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/manutencao/chamados/${chamado.id}/comentarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: comentario }),
      });
      if (!res.ok) throw new Error("Erro ao enviar comentário.");
      const data = await res.json();
      setComentarios((prev) => [...prev, data.comentario]);
      setComentario("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar comentário.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const drafts: AnexoDraft[] = [];
      for (const file of Array.from(fileList)) {
        const blob = await upload(sanitizeFileName(file.name), file, { access: "public", handleUploadUrl: "/api/upload" });
        drafts.push({
          name: file.name,
          fileUrl: blob.url,
          mimeType: file.type,
          sizeBytes: file.size,
          tipo: file.type.startsWith("video/") ? "VIDEO" : file.type.startsWith("image/") ? "FOTO" : "DOCUMENTO",
        });
      }
      const res = await fetch(`/api/manutencao/chamados/${chamado.id}/anexos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anexos: drafts }),
      });
      if (!res.ok) throw new Error("Erro ao anexar arquivo.");
      const data = await res.json();
      setAnexos(data.anexos);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao anexar arquivo.");
    } finally {
      setUploading(false);
    }
  }

  async function updateOrcamentoStatus(orcamentoId: string, status: string, motivoRecusa?: string) {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/manutencao/orcamentos/${orcamentoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, motivoRecusa }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao atualizar orçamento.");
      }
      const data = await res.json();
      setOrcamentos((prev) => prev.map((o) => (o.id === orcamentoId ? { ...o, ...data.orcamento } : o)));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar orçamento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 space-y-6">
        <div className="nord-card p-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs text-nord-gray font-mono mb-1">{chamado.protocolo}</p>
              <h2 className="text-white font-semibold text-lg">{chamado.titulo}</h2>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge>{CHAMADO_CATEGORIA_LABEL[chamado.categoria] ?? chamado.categoria}</Badge>
                <span className="text-xs font-medium" style={{ color: CHAMADO_PRIORIDADE_COLOR[chamado.prioridade] }}>
                  {CHAMADO_PRIORIDADE_LABEL[chamado.prioridade]}
                </span>
                <Badge tone={overdue ? "danger" : "default"}>{CHAMADO_STATUS_LABEL[chamado.status] ?? chamado.status}</Badge>
              </div>
            </div>
          </div>
          <p className="text-sm text-white mt-4 whitespace-pre-wrap">{chamado.descricao}</p>
          <div className="grid grid-cols-2 gap-3 mt-4 text-xs text-nord-gray">
            <span>Loja: <span className="text-white">{chamado.empresa.name}</span></span>
            <span>Setor: <span className="text-white">{chamado.setor}</span></span>
            {chamado.localEspecifico && <span>Local: <span className="text-white">{chamado.localEspecifico}</span></span>}
            <span>Solicitante: <span className="text-white">{chamado.solicitante.name}</span></span>
            <span>Aberto em: <span className="text-white">{format(new Date(chamado.createdAt), "dd/MM/yyyy 'às' HH:mm")}</span></span>
          </div>
        </div>

        {chamado.equipamento && (
          <Section title="Equipamento relacionado">
            <div className="flex items-center gap-3">
              {chamado.equipamento.fotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={chamado.equipamento.fotoUrl} alt={chamado.equipamento.nome} className="w-14 h-14 rounded-lg object-cover" />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-nord-panel" />
              )}
              <div className="flex-1">
                <a href={`/portal/manutencao/equipamentos/${chamado.equipamento.id}`} className="text-white font-medium hover:underline">
                  {chamado.equipamento.nome}
                </a>
                <p className="text-xs text-nord-gray font-mono">{chamado.equipamento.codigo}</p>
              </div>
            </div>
          </Section>
        )}

        <Section title="Fotos, vídeos e documentos">
          <div className="flex flex-wrap gap-2 mb-3">
            {anexos.map((a) => (
              <a key={a.id} href={a.fileUrl} target="_blank" rel="noreferrer" className="nord-card p-2 text-xs text-nord-blue-light hover:underline">
                {a.name}
              </a>
            ))}
            {anexos.length === 0 && <p className="text-sm text-nord-gray">Nenhum anexo ainda.</p>}
          </div>
          <label className={`btn-outline inline-flex cursor-pointer ${uploading ? "opacity-60" : ""}`}>
            <UploadIcon size={13} /> {uploading ? "Enviando..." : "Anexar arquivo"}
            <input type="file" multiple hidden onChange={(e) => handleUpload(e.target.files)} disabled={uploading} />
          </label>
        </Section>

        <Section title="Linha do tempo">
          <div className="space-y-2 max-h-[300px] overflow-y-auto nord-scrollbar">
            {(chamado.historico ?? []).map((h) => (
              <div key={h.id} className="flex items-start gap-2.5 text-xs border-b border-nord-border/50 pb-2 last:border-0">
                <div className="flex-1">
                  <p className="text-white">
                    <span className="font-medium">{h.user?.name ?? "Sistema"}</span> {describeChamadoHistoricoAction(h.action)}
                    {h.detail ? <span className="text-nord-gray"> — {h.detail}</span> : null}
                  </p>
                  <p className="text-[10px] text-nord-gray mt-0.5">{format(new Date(h.createdAt), "dd/MM/yyyy 'às' HH:mm")}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Comentários">
          <div className="space-y-3 mb-3 max-h-[240px] overflow-y-auto nord-scrollbar">
            {comentarios.map((c) => (
              <div key={c.id} className="text-sm">
                <p className="text-white"><span className="font-medium">{c.author.name}</span> <span className="text-nord-gray text-xs">{format(new Date(c.createdAt), "dd/MM 'às' HH:mm")}</span></p>
                <p className="text-nord-gray">{c.text}</p>
              </div>
            ))}
            {comentarios.length === 0 && <p className="text-sm text-nord-gray">Nenhum comentário ainda.</p>}
          </div>
          <div className="flex gap-2">
            <input className="input flex-1" placeholder="Escrever um comentário..." value={comentario} onChange={(e) => setComentario(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendComentario()} />
            <button className="btn-primary" onClick={sendComentario} disabled={saving}>
              <Send size={14} />
            </button>
          </div>
        </Section>

        <Section
          title="Orçamentos"
          action={
            canManage && (
              <button className="text-xs text-nord-blue-light hover:underline" onClick={() => setShowOrcamentoModal(true)}>
                + Adicionar orçamento
              </button>
            )
          }
        >
          <div className="space-y-3">
            {orcamentos.map((o) => (
              <div key={o.id} className="border-b border-nord-border/50 pb-3 last:border-0">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-white font-medium">{o.prestador.nome}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white">{formatCurrency(o.valorTotal)}</span>
                    <Badge tone={ORCAMENTO_STATUS_TONE[o.status]}>{ORCAMENTO_STATUS_LABEL[o.status] ?? o.status}</Badge>
                  </div>
                </div>
                {o.descricao && <p className="text-xs text-nord-gray mt-1">{o.descricao}</p>}
                <div className="flex items-center gap-3 text-[11px] text-nord-gray mt-1">
                  {o.prazo && <span>Prazo: {o.prazo}</span>}
                  {o.garantia && <span>Garantia: {o.garantia}</span>}
                </div>
                {o.anexos && o.anexos.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {o.anexos.map((a) => (
                      <a key={a.id} href={a.fileUrl} target="_blank" rel="noreferrer" className="text-[11px] text-nord-blue-light hover:underline">
                        {a.name}
                      </a>
                    ))}
                  </div>
                )}
                {o.status === "RECUSADO" && o.motivoRecusa && (
                  <p className="text-xs text-nord-danger mt-1">Motivo: {o.motivoRecusa}</p>
                )}
                {canManage && (o.status === "RECEBIDO" || o.status === "EM_ANALISE") && (
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      className="text-xs px-2.5 py-1 rounded-lg bg-nord-success/15 text-nord-success hover:bg-nord-success/25"
                      onClick={() => updateOrcamentoStatus(o.id, "APROVADO")}
                      disabled={saving}
                    >
                      Aprovar
                    </button>
                    <input
                      className="input flex-1 text-xs py-1"
                      placeholder="Motivo da recusa (obrigatório)"
                      value={recusaDraft[o.id] ?? ""}
                      onChange={(e) => setRecusaDraft((prev) => ({ ...prev, [o.id]: e.target.value }))}
                    />
                    <button
                      className="text-xs px-2.5 py-1 rounded-lg bg-nord-danger/15 text-nord-danger hover:bg-nord-danger/25"
                      onClick={() => updateOrcamentoStatus(o.id, "RECUSADO", recusaDraft[o.id])}
                      disabled={saving || !recusaDraft[o.id]?.trim()}
                    >
                      Recusar
                    </button>
                  </div>
                )}
              </div>
            ))}
            {orcamentos.length === 0 && <p className="text-sm text-nord-gray text-center py-4">Nenhum orçamento registrado ainda.</p>}
          </div>
        </Section>

        {(chamado.registros ?? []).length > 0 && (
          <Section title="Manutenções registradas para este chamado">
            <div className="space-y-2">
              {chamado.registros!.map((r) => (
                <div key={r.id} className="text-sm border-b border-nord-border/50 pb-2 last:border-0">
                  <p className="text-white">{format(new Date(r.data), "dd/MM/yyyy")} — {r.servicoExecutado}</p>
                  <p className="text-xs text-nord-gray">Responsável: {r.responsavel.name}</p>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>

      <div className="space-y-6">
        <FormError message={error} />
        <Section title="Status">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {KANBAN_COLUMNS.map((col) => (
              <button
                key={col.key}
                onClick={() => changeStatus(col.key)}
                disabled={saving || !canManage}
                className="text-[11px] px-2 py-1 rounded-full font-medium disabled:opacity-40"
                style={{
                  backgroundColor: chamado.status === col.key ? col.color : `${col.color}22`,
                  color: chamado.status === col.key ? "#fff" : col.color,
                }}
              >
                {col.label}
              </button>
            ))}
          </div>
          {(descricaoSolucao || chamado.status !== "RESOLVIDO") && (
            <div>
              <label className="text-xs text-nord-gray mb-1 block">Descrição da solução {chamado.status !== "RESOLVIDO" && "(obrigatória para resolver)"}</label>
              <textarea className="input w-full min-h-[60px]" value={descricaoSolucao} onChange={(e) => setDescricaoSolucao(e.target.value)} disabled={!canManage} />
            </div>
          )}
        </Section>

        <Section title="Responsável e prazo">
          <div className="space-y-3">
            <div>
              <label className="text-xs text-nord-gray mb-1 block">Responsável</label>
              <select className="input w-full" value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)} disabled={!canManage}>
                <option value="">A definir</option>
                {teamMembers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-nord-gray mb-1 block">Prazo</label>
              <input type="date" className="input w-full" value={prazo} onChange={(e) => setPrazo(e.target.value)} disabled={!canManage} />
            </div>
            {canManage && (
              <button className="btn-outline w-full" onClick={saveResponsavelPrazo} disabled={saving}>
                Salvar
              </button>
            )}
          </div>
        </Section>

        {chamado.equipamentoId ? (
          <button className="btn-primary w-full" onClick={() => setShowRegistro(true)}>
            Registrar manutenção
          </button>
        ) : (
          <p className="text-xs text-nord-gray text-center">Vincule um equipamento a este chamado para registrar a manutenção realizada.</p>
        )}
      </div>

      {chamado.equipamentoId && (
        <ManutencaoRegistroModal
          open={showRegistro}
          onClose={() => setShowRegistro(false)}
          equipamentoId={chamado.equipamentoId}
          chamadoId={chamado.id}
          onSaved={() => {
            setShowRegistro(false);
            router.refresh();
          }}
        />
      )}

      <OrcamentoFormModal
        open={showOrcamentoModal}
        onClose={() => setShowOrcamentoModal(false)}
        chamadoId={chamado.id}
        prestadores={prestadores}
        onSaved={() => {
          setShowOrcamentoModal(false);
          router.refresh();
        }}
      />
    </div>
  );
}
