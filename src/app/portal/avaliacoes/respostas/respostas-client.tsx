"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Pencil, Send, Star, X } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { FormError } from "@/components/ui/modal";

type ReviewStatus =
  | "PENDENTE"
  | "RESPONDIDA"
  | "PRECISA_REVISAO_MANUAL"
  | "AUTO_PUBLICADA_SEM_RESPOSTA"
  | "EXPIRADA"
  | "ERRO"
  | "SIMULADA";

const STATUS_OPTIONS: ReviewStatus[] = [
  "PENDENTE",
  "RESPONDIDA",
  "PRECISA_REVISAO_MANUAL",
  "AUTO_PUBLICADA_SEM_RESPOSTA",
  "EXPIRADA",
  "ERRO",
  "SIMULADA",
];
const STATUS_LABEL: Record<ReviewStatus, string> = {
  PENDENTE: "Pendente",
  RESPONDIDA: "Respondida",
  PRECISA_REVISAO_MANUAL: "Precisa revisão manual",
  AUTO_PUBLICADA_SEM_RESPOSTA: "Publicada sem resposta",
  EXPIRADA: "Expirada",
  ERRO: "Erro",
  // "(não publicada)" direto no rótulo do badge, de propósito — ver pedido do Matheus: nunca
  // pode parecer que uma simulação já está no ar quando não está.
  SIMULADA: "Simulação (não publicada)",
};
const STATUS_TONE: Record<ReviewStatus, "default" | "success" | "warning" | "danger" | "info" | "purple"> = {
  PENDENTE: "warning",
  RESPONDIDA: "success",
  PRECISA_REVISAO_MANUAL: "danger",
  AUTO_PUBLICADA_SEM_RESPOSTA: "info",
  EXPIRADA: "default",
  ERRO: "danger",
  // Tom "purple" exclusivo de SIMULADA — nenhum outro status usa esse tom, pra nunca ser
  // confundido visualmente com "Respondida" (verde) ou qualquer status já publicado.
  SIMULADA: "purple",
};

// Mesmo limite rígido da API do iFood (ver src/lib/review-ai.ts) — duplicado aqui de propósito:
// este arquivo é client component, não pode importar de src/lib/review-ai.ts (que carrega o SDK
// da Anthropic em tempo de módulo).
const REPLY_MIN_LENGTH = 10;
const REPLY_MAX_LENGTH = 300;

type ReviewRow = {
  id: string;
  empresa: { id: string; name: string };
  platform: "IFOOD" | "GOOGLE";
  rating: number;
  comment: string | null;
  customerName: string | null;
  reviewDate: string;
  status: ReviewStatus;
  generatedReply: string | null;
  postedReply: string | null;
  repliedAt: string | null;
  errorMessage: string | null;
};
type ListResponse = { reviews: ReviewRow[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } };

function RatingBadge({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-white">
      <Star size={13} className="fill-nord-warning text-nord-warning" />
      {rating}
    </span>
  );
}

export function RespostasClient({
  canEdit,
  isGrupoNordMode,
  empresas,
}: {
  canEdit: boolean;
  isGrupoNordMode: boolean;
  empresas: { id: string; name: string }[];
}) {
  const [status, setStatus] = useState<ReviewStatus | "">("");
  const [empresaId, setEmpresaId] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingSaving, setEditingSaving] = useState(false);
  const [editingError, setEditingError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: "20" });
        if (status) params.set("status", status);
        if (empresaId) params.set("empresaId", empresaId);
        const res = await fetch(`/api/avaliacoes/reviews?${params.toString()}`);
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(json?.error ?? "Não foi possível carregar as avaliações.");
          return;
        }
        setData(json);
      } catch {
        if (!cancelled) setLoadError("Falha de conexão. Verifique sua internet e tente novamente.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [status, empresaId, page]);

  function startEditing(row: ReviewRow) {
    setEditingId(row.id);
    setEditingText(row.generatedReply ?? "");
    setEditingError(null);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditingText("");
    setEditingError(null);
  }

  async function confirmarResposta(id: string) {
    const reply = editingText.trim();
    if (reply.length < REPLY_MIN_LENGTH || reply.length > REPLY_MAX_LENGTH) {
      setEditingError(`O texto precisa ter entre ${REPLY_MIN_LENGTH} e ${REPLY_MAX_LENGTH} caracteres (limite do iFood).`);
      return;
    }
    setEditingSaving(true);
    setEditingError(null);
    try {
      const res = await fetch(`/api/avaliacoes/reviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditingError(json?.error ?? "Não foi possível publicar a resposta.");
        return;
      }
      setData((current) =>
        current
          ? {
              ...current,
              reviews: current.reviews.map((r) =>
                r.id === id ? { ...r, status: "RESPONDIDA", postedReply: reply, repliedAt: json.review?.repliedAt ?? new Date().toISOString() } : r
              ),
            }
          : current
      );
      cancelEditing();
    } catch {
      setEditingError("Falha de conexão. Tente novamente.");
    } finally {
      setEditingSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Section title="Filtros">
        <div className="flex flex-wrap items-center gap-2">
          {isGrupoNordMode && (
            <select
              value={empresaId}
              onChange={(e) => {
                setEmpresaId(e.target.value);
                setPage(1);
              }}
              className="input w-44"
            >
              <option value="">Todas as unidades</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          )}
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as ReviewStatus | "");
              setPage(1);
            }}
            className="input w-52"
          >
            <option value="">Todos os status</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </Section>

      <Section
        title="Avaliações do iFood"
        action={
          data ? (
            <span className="text-xs text-nord-gray">
              {data.pagination.total} encontrada{data.pagination.total === 1 ? "" : "s"}
              {loading ? " · atualizando..." : ""}
            </span>
          ) : undefined
        }
      >
        {loading && !data ? (
          <div className="p-8 text-center text-sm text-nord-gray">Carregando...</div>
        ) : loadError ? (
          <div className="p-8 text-center text-sm text-nord-danger">{loadError}</div>
        ) : (
          data && (
            <>
              <div className="overflow-x-auto nord-scrollbar">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                      <th className="py-2 pr-4">Data</th>
                      {isGrupoNordMode && <th className="py-2 pr-4">Loja</th>}
                      <th className="py-2 pr-4">Nota</th>
                      <th className="py-2 pr-4">Cliente</th>
                      <th className="py-2 pr-4">Comentário</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Resposta</th>
                      <th className="py-2 pr-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.reviews.map((r) => {
                      const isEditing = editingId === r.id;
                      const podeRevisar = canEdit && (r.status === "PRECISA_REVISAO_MANUAL" || r.status === "ERRO");
                      const respostaExibida = r.postedReply ?? r.generatedReply;
                      return (
                        <tr key={r.id} className="border-b border-nord-border/50 hover:bg-white/5 align-top">
                          <td className="py-2.5 pr-4 text-nord-gray whitespace-nowrap">{format(new Date(r.reviewDate), "dd/MM/yyyy HH:mm")}</td>
                          {isGrupoNordMode && <td className="py-2.5 pr-4 text-nord-gray">{r.empresa.name}</td>}
                          <td className="py-2.5 pr-4">
                            <RatingBadge rating={r.rating} />
                          </td>
                          <td className="py-2.5 pr-4 text-white">{r.customerName ?? "—"}</td>
                          <td className="py-2.5 pr-4 text-nord-gray max-w-xs truncate" title={r.comment ?? undefined}>
                            {r.comment ?? "—"}
                          </td>
                          <td className="py-2.5 pr-4">
                            <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                            {r.status === "ERRO" && r.errorMessage && (
                              <p className="text-[11px] text-nord-danger mt-1 max-w-[180px]" title={r.errorMessage}>
                                {r.errorMessage}
                              </p>
                            )}
                          </td>
                          <td className="py-2.5 pr-4 max-w-sm">
                            {isEditing ? (
                              <div className="space-y-1.5">
                                <textarea
                                  value={editingText}
                                  onChange={(e) => setEditingText(e.target.value)}
                                  rows={3}
                                  className="input w-full text-xs"
                                  maxLength={REPLY_MAX_LENGTH}
                                  placeholder="Escreva a resposta que será publicada no iFood..."
                                />
                                <div className="flex items-center justify-between">
                                  <span className={`text-[11px] ${editingText.trim().length < REPLY_MIN_LENGTH ? "text-nord-danger" : "text-nord-gray"}`}>
                                    {editingText.trim().length}/{REPLY_MAX_LENGTH} (mín. {REPLY_MIN_LENGTH})
                                  </span>
                                </div>
                                <FormError message={editingError} />
                              </div>
                            ) : (
                              <>
                                <span className="text-nord-gray truncate block" title={respostaExibida ?? undefined}>
                                  {respostaExibida ?? "—"}
                                </span>
                                {r.status === "SIMULADA" && (
                                  <p className="text-[11px] text-purple-400 mt-0.5">Prévia — nunca foi enviada ao iFood.</p>
                                )}
                              </>
                            )}
                          </td>
                          <td className="py-2.5 pr-4 whitespace-nowrap">
                            {isEditing ? (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => confirmarResposta(r.id)}
                                  disabled={editingSaving}
                                  className="inline-flex items-center gap-1 text-xs text-nord-success hover:underline disabled:opacity-50"
                                  title="Publicar resposta"
                                >
                                  <Send size={13} /> {editingSaving ? "Enviando..." : "Publicar"}
                                </button>
                                <button
                                  onClick={cancelEditing}
                                  disabled={editingSaving}
                                  className="inline-flex items-center gap-1 text-xs text-nord-gray hover:text-white disabled:opacity-50"
                                  title="Cancelar"
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            ) : (
                              podeRevisar && (
                                <button
                                  onClick={() => startEditing(r)}
                                  className="inline-flex items-center gap-1 text-xs text-nord-blue-light hover:underline whitespace-nowrap"
                                >
                                  <Pencil size={13} /> Revisar
                                </button>
                              )
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {data.reviews.length === 0 && (
                      <tr>
                        <td colSpan={isGrupoNordMode ? 8 : 7} className="py-8 text-center text-nord-gray text-sm">
                          Nenhuma avaliação encontrada com os filtros selecionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {data.reviews.length > 0 && (
                <div className="flex items-center justify-between mt-4 text-xs text-nord-gray flex-wrap gap-2">
                  <span>
                    Página {data.pagination.page} de {data.pagination.totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={data.pagination.page <= 1}
                      className="btn-outline px-2.5 py-1 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Anterior
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                      disabled={data.pagination.page >= data.pagination.totalPages}
                      className="btn-outline px-2.5 py-1 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              )}
            </>
          )
        )}
      </Section>
    </div>
  );
}
