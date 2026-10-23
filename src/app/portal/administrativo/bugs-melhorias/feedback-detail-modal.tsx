"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { format } from "date-fns";
import { Send } from "lucide-react";
import { Modal, FormError } from "@/components/ui/modal";
import { Section, Badge } from "@/components/ui/stat-card";
import {
  FEEDBACK_CATEGORIA_PROBLEMA_LABEL,
  FEEDBACK_IMPACTO_LABEL,
  FEEDBACK_PRIORIDADE_COLOR,
  FEEDBACK_PRIORIDADE_LABEL,
  FEEDBACK_PRIORIDADE_OPTIONS,
  FEEDBACK_STATUS_BY_TIPO,
  FEEDBACK_STATUS_LABEL,
  FEEDBACK_STATUS_REQUIRES_SOLUCAO,
  FEEDBACK_STATUS_TONE,
  FEEDBACK_TONE_HEX,
  describeHistoricoEntry,
  resolveModuloLabel,
} from "./labels";
import type { FeedbackDetail, UserOption } from "./types";

/**
 * Modal de detalhe/edição de um relato (bug ou sugestão) — aberta a partir de qualquer aba da
 * tela (Bugs, Sugestões, Relatórios, Histórico), sempre pelo `id`. Busca `GET
 * /api/feedback/[id]` ao abrir (ou trocar de `id` — ex.: ao clicar num link de "possível
 * duplicata" dentro da própria modal, `onOpenRelated` troca o `id` sem fechar/reabrir). Toda
 * edição (status/prioridade/responsável/descrição da solução/versão corrigida) passa por
 * `PATCH /api/feedback/[id]`; comentário interno por `POST /api/feedback/[id]/comentarios`.
 * `onChanged` avisa o componente pai (para recarregar listagem/indicadores) sempre que uma
 * edição é salva com sucesso.
 */
export function FeedbackDetailModal({
  id,
  usuarios,
  onClose,
  onOpenRelated,
  onChanged,
}: {
  id: string | null;
  usuarios: UserOption[];
  onClose: () => void;
  onOpenRelated: (id: string) => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<FeedbackDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prioridadeDraft, setPrioridadeDraft] = useState("");
  const [responsavelDraft, setResponsavelDraft] = useState("");
  const [versaoDraft, setVersaoDraft] = useState("");
  const [solucaoDraft, setSolucaoDraft] = useState("");
  const [comentarioDraft, setComentarioDraft] = useState("");

  useEffect(() => {
    if (!id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- limpa o detalhe ao fechar a modal (id vira null)
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setError(null);
    setDetail(null);
    fetch(`/api/feedback/${id}`)
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error ?? "Não foi possível carregar o relato.");
        return json.report as FeedbackDetail;
      })
      .then((report) => {
        if (cancelled) return;
        setDetail(report);
        setPrioridadeDraft(report.prioridade);
        setResponsavelDraft(report.responsavelId ?? "");
        setVersaoDraft(report.versaoCorrigidaEm ?? "");
        setSolucaoDraft(report.descricaoSolucao ?? "");
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Não foi possível carregar o relato.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  function resolveUserName(userId: string | null): string {
    if (!userId) return "Ninguém";
    return usuarios.find((u) => u.id === userId)?.name ?? "Usuário";
  }

  async function patchFeedback(body: Record<string, unknown>) {
    if (!detail) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/feedback/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Não foi possível salvar a alteração.");
      // `report.historico` na resposta do PATCH ainda NÃO inclui a(s) linha(s) de histórico
      // geradas por esta própria chamada: a rota busca `report` (com `include: historico`)
      // ANTES de gravar o histórico desta alteração (por isso ela devolve `historyEntries` à
      // parte — ver `PATCH /api/feedback/[id]`, src/app/api/feedback/[id]/route.ts). Em vez de
      // reconstruir a entrada de histórico no cliente (exigiria inventar id/data/autor), refaz
      // um GET completo logo em seguida — achado em teste ao vivo desta tarefa (sem isso, a
      // modal mostrava "Nenhuma alteração registrada ainda" até fechar e reabrir).
      const refetched = await fetch(`/api/feedback/${detail.id}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      const report = (refetched?.report ?? json.report) as FeedbackDetail;
      setDetail(report);
      setPrioridadeDraft(report.prioridade);
      setResponsavelDraft(report.responsavelId ?? "");
      setVersaoDraft(report.versaoCorrigidaEm ?? "");
      setSolucaoDraft(report.descricaoSolucao ?? "");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a alteração.");
    } finally {
      setSaving(false);
    }
  }

  function changeStatus(newStatus: string) {
    if (!detail || newStatus === detail.status) return;
    if (FEEDBACK_STATUS_REQUIRES_SOLUCAO.has(newStatus) && !solucaoDraft.trim()) {
      setError(`Descreva a solução aplicada antes de marcar como "${FEEDBACK_STATUS_LABEL[newStatus] ?? newStatus}".`);
      return;
    }
    patchFeedback({ status: newStatus, descricaoSolucao: solucaoDraft.trim() ? solucaoDraft.trim() : undefined });
  }

  async function sendComentario() {
    if (!detail || !comentarioDraft.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/feedback/${detail.id}/comentarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conteudo: comentarioDraft.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Não foi possível enviar o comentário.");
      setDetail((prev) => (prev ? { ...prev, comentarios: [...prev.comentarios, json.comment] } : prev));
      setComentarioDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o comentário.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!id} onClose={onClose} title={detail ? detail.protocolo : "Relato"} widthClass="max-w-4xl">
      {loading && <div className="p-8 text-center text-sm text-nord-gray">Carregando...</div>}
      {loadError && <FormError message={loadError} />}

      {detail && (
        <div className="space-y-5">
          <FormError message={error} />

          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <Badge tone={detail.tipo === "BUG" ? "danger" : "warning"}>{detail.tipo === "BUG" ? "Bug" : "Sugestão"}</Badge>
              <Badge tone={FEEDBACK_STATUS_TONE[detail.status] ?? "default"}>{FEEDBACK_STATUS_LABEL[detail.status] ?? detail.status}</Badge>
              <span className="text-xs font-medium" style={{ color: FEEDBACK_PRIORIDADE_COLOR[detail.prioridade] }}>
                Prioridade {FEEDBACK_PRIORIDADE_LABEL[detail.prioridade] ?? detail.prioridade}
              </span>
            </div>
            <h3 className="text-white font-semibold text-lg">{detail.titulo}</h3>
            <p className="text-sm text-white mt-3 whitespace-pre-wrap">{detail.descricao}</p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 mt-4 text-xs text-nord-gray">
              <span>Módulo: <span className="text-white">{resolveModuloLabel(detail)}</span></span>
              <span>Usuário: <span className="text-white">{detail.usuarioCriador.name}</span></span>
              <span>Loja: <span className="text-white">{detail.empresa?.name ?? "Todas / Geral"}</span></span>
              <span>Criado em: <span className="text-white">{format(new Date(detail.createdAt), "dd/MM/yyyy 'às' HH:mm")}</span></span>
              {detail.dataConclusao && (
                <span>Concluído em: <span className="text-white">{format(new Date(detail.dataConclusao), "dd/MM/yyyy 'às' HH:mm")}</span></span>
              )}
              {detail.tipo === "BUG" && detail.categoriaProblema && (
                <span>Categoria do problema: <span className="text-white">{FEEDBACK_CATEGORIA_PROBLEMA_LABEL[detail.categoriaProblema] ?? detail.categoriaProblema}</span></span>
              )}
              {detail.tipo === "BUG" && detail.impacto && (
                <span>Impacto: <span className="text-white">{FEEDBACK_IMPACTO_LABEL[detail.impacto] ?? detail.impacto}</span></span>
              )}
              {detail.tipo === "SUGESTAO" && detail.beneficioEsperado && (
                <span className="col-span-full">Benefício esperado: <span className="text-white">{detail.beneficioEsperado}</span></span>
              )}
            </div>
          </div>

          {(detail.possivelDuplicataDe || detail.duplicatas.length > 0) && (
            <Section title="Possível duplicidade">
              <div className="space-y-2">
                {detail.possivelDuplicataDe && (
                  <button
                    type="button"
                    onClick={() => onOpenRelated(detail.possivelDuplicataDe!.id)}
                    className="w-full text-left flex items-center justify-between gap-2 p-2 rounded-lg bg-nord-panel hover:bg-white/5"
                  >
                    <span className="text-sm text-white">
                      Este relato pode ser uma duplicata de{" "}
                      <span className="font-mono text-nord-blue-light">{detail.possivelDuplicataDe.protocolo}</span> —{" "}
                      {detail.possivelDuplicataDe.titulo}
                    </span>
                    <Badge tone={FEEDBACK_STATUS_TONE[detail.possivelDuplicataDe.status] ?? "default"}>
                      {FEEDBACK_STATUS_LABEL[detail.possivelDuplicataDe.status] ?? detail.possivelDuplicataDe.status}
                    </Badge>
                  </button>
                )}
                {detail.duplicatas.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-nord-gray">Relatos marcados como possível duplicata deste:</p>
                    {detail.duplicatas.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => onOpenRelated(d.id)}
                        className="w-full text-left flex items-center justify-between gap-2 p-2 rounded-lg bg-nord-panel hover:bg-white/5"
                      >
                        <span className="text-sm text-white">
                          <span className="font-mono text-nord-blue-light">{d.protocolo}</span> — {d.titulo}
                        </span>
                        <Badge tone={FEEDBACK_STATUS_TONE[d.status] ?? "default"}>{FEEDBACK_STATUS_LABEL[d.status] ?? d.status}</Badge>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Section>
          )}

          <Section title="Informações técnicas">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
              <span className="text-nord-gray">Rota: <span className="text-white">{detail.metadados?.rotaOrigem ?? "—"}</span></span>
              <span className="text-nord-gray">Navegador: <span className="text-white">{detail.metadados?.navegador ?? "—"}</span></span>
              <span className="text-nord-gray">Sistema: <span className="text-white">{detail.metadados?.sistemaOperacional ?? "—"}</span></span>
              <span className="text-nord-gray">Dispositivo: <span className="text-white">{detail.metadados?.tipoDispositivo ?? "—"}</span></span>
              <span className="text-nord-gray">Versão do Portal: <span className="text-white">{detail.metadados?.versaoPortal ?? "—"}</span></span>
            </div>
          </Section>

          <Section title={`Anexos (${detail.anexos.length})`}>
            {detail.anexos.length === 0 ? (
              <p className="text-sm text-nord-gray">Nenhum anexo enviado.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {detail.anexos.map((a) => (
                  <a
                    key={a.id}
                    href={a.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block nord-card overflow-hidden border border-nord-border hover:border-nord-blue/60 transition"
                  >
                    {a.mimeType?.startsWith("video/") ? (
                      <video src={a.fileUrl} controls className="w-full h-28 object-cover bg-black" />
                    ) : (
                      <div className="relative w-full h-28 bg-nord-panel">
                        <Image src={a.fileUrl} alt={a.fileName} fill sizes="200px" className="object-cover" />
                      </div>
                    )}
                    <p className="text-[11px] text-nord-gray p-1.5 truncate" title={a.fileName}>{a.fileName}</p>
                  </a>
                ))}
              </div>
            )}
          </Section>

          <Section title="Status e solução">
            <div className="flex flex-wrap gap-1.5 mb-3">
              {FEEDBACK_STATUS_BY_TIPO[detail.tipo].map((s) => {
                const hex = FEEDBACK_TONE_HEX[FEEDBACK_STATUS_TONE[s] ?? "default"];
                const active = detail.status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => changeStatus(s)}
                    disabled={saving}
                    className="text-[11px] px-2.5 py-1 rounded-full font-medium disabled:opacity-40"
                    style={{ backgroundColor: active ? hex : `${hex}22`, color: active ? "#fff" : hex }}
                  >
                    {FEEDBACK_STATUS_LABEL[s] ?? s}
                  </button>
                );
              })}
            </div>
            <Field label="Descrição da solução aplicada (obrigatória para corrigir/implementar)">
              <textarea
                className="input w-full min-h-[70px]"
                value={solucaoDraft}
                onChange={(e) => setSolucaoDraft(e.target.value)}
              />
            </Field>
            <div className="flex justify-end mt-1.5">
              <button
                type="button"
                className="btn-outline"
                disabled={saving || solucaoDraft.trim() === (detail.descricaoSolucao ?? "")}
                onClick={() => patchFeedback({ descricaoSolucao: solucaoDraft.trim() || null })}
              >
                Salvar descrição
              </button>
            </div>
          </Section>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Section title="Prioridade">
              <div className="flex items-center gap-2">
                <select value={prioridadeDraft} onChange={(e) => setPrioridadeDraft(e.target.value)} className="input flex-1">
                  {FEEDBACK_PRIORIDADE_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {FEEDBACK_PRIORIDADE_LABEL[p] ?? p}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-outline shrink-0"
                  disabled={saving || prioridadeDraft === detail.prioridade}
                  onClick={() => patchFeedback({ prioridade: prioridadeDraft })}
                >
                  Salvar
                </button>
              </div>
            </Section>

            <Section title="Responsável">
              <div className="flex items-center gap-2">
                <select value={responsavelDraft} onChange={(e) => setResponsavelDraft(e.target.value)} className="input flex-1">
                  <option value="">Sem responsável</option>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-outline shrink-0"
                  disabled={saving || responsavelDraft === (detail.responsavelId ?? "")}
                  onClick={() => patchFeedback({ responsavelId: responsavelDraft || null })}
                >
                  Salvar
                </button>
              </div>
            </Section>
          </div>

          <Section title="Versão corrigida em (changelog)">
            <div className="flex items-center gap-2">
              <input
                value={versaoDraft}
                onChange={(e) => setVersaoDraft(e.target.value)}
                placeholder="ex.: v1.4.2"
                className="input flex-1"
              />
              <button
                type="button"
                className="btn-outline shrink-0"
                disabled={saving || versaoDraft.trim() === (detail.versaoCorrigidaEm ?? "")}
                onClick={() => patchFeedback({ versaoCorrigidaEm: versaoDraft.trim() || null })}
              >
                Salvar
              </button>
            </div>
          </Section>

          <Section title="Histórico completo">
            <div className="space-y-2 max-h-[260px] overflow-y-auto nord-scrollbar">
              {detail.historico.length === 0 && <p className="text-sm text-nord-gray">Nenhuma alteração registrada ainda.</p>}
              {detail.historico.map((h) => (
                <div key={h.id} className="text-xs border-b border-nord-border/50 pb-2 last:border-0">
                  <p className="text-white">
                    <span className="font-medium">{h.usuarioResponsavel.name}</span> — {describeHistoricoEntry(h, resolveUserName)}
                  </p>
                  {h.comentario && <p className="text-nord-gray mt-0.5">&ldquo;{h.comentario}&rdquo;</p>}
                  <p className="text-[10px] text-nord-gray mt-0.5">{format(new Date(h.createdAt), "dd/MM/yyyy 'às' HH:mm")}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Comentários internos">
            <div className="space-y-3 mb-3 max-h-[220px] overflow-y-auto nord-scrollbar">
              {detail.comentarios.length === 0 && <p className="text-sm text-nord-gray">Nenhum comentário ainda.</p>}
              {detail.comentarios.map((c) => (
                <div key={c.id} className="text-sm">
                  <p className="text-white">
                    <span className="font-medium">{c.autor.name}</span>{" "}
                    <span className="text-nord-gray text-xs">{format(new Date(c.createdAt), "dd/MM 'às' HH:mm")}</span>
                  </p>
                  <p className="text-nord-gray">{c.conteudo}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="Escrever um comentário interno..."
                value={comentarioDraft}
                onChange={(e) => setComentarioDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendComentario()}
              />
              <button className="btn-primary" onClick={sendComentario} disabled={saving || !comentarioDraft.trim()}>
                <Send size={14} />
              </button>
            </div>
          </Section>
        </div>
      )}
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-nord-gray mb-1 block">{label}</span>
      {children}
    </label>
  );
}
