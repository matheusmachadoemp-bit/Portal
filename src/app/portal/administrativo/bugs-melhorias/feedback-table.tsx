"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Eye, Copy } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { formatNumber } from "@/lib/calc";
import {
  FEEDBACK_PRIORIDADE_COLOR,
  FEEDBACK_PRIORIDADE_LABEL,
  FEEDBACK_STATUS_LABEL,
  FEEDBACK_STATUS_TONE,
  resolveModuloLabel,
} from "./labels";
import type { FeedbackListItem, FeedbackTipo } from "./types";

const PAGE_SIZE = 25;

type ListResponse = { reports: FeedbackListItem[]; total: number };

/**
 * Aba "Bugs" ou "Sugestões" — tabela paginada de `GET /api/feedback?tipo=...`, com os filtros
 * compartilhados vindos de `BugsMelhoriasClient` (período, módulo, status, prioridade, usuário).
 * A coluna "Prioridade" só aparece para Bugs: embora `prioridade` seja um campo preenchido para
 * os dois tipos no banco (sugestão nasce sempre MEDIA, mas um admin pode alterar depois via
 * PATCH), o conceito de "prioridade por impacto" do pedido original é específico de bug — decisão
 * de design desta tarefa (documentada no relatório). A prioridade continua editável no painel de
 * detalhe para os dois tipos, só não vira coluna na listagem de Sugestões.
 */
export function FeedbackListaTab({
  tipo,
  fromISO,
  toISO,
  categoriaId,
  subcategoriaId,
  status,
  prioridade,
  usuarioCriadorId,
  refreshToken,
  onOpenDetail,
}: {
  tipo: FeedbackTipo;
  fromISO?: string;
  toISO?: string;
  categoriaId?: string;
  subcategoriaId?: string;
  status: string;
  prioridade: string;
  usuarioCriadorId: string;
  refreshToken: number;
  onOpenDetail: (id: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- volta pra página 1 sempre que um filtro muda
    setPage(1);
  }, [fromISO, toISO, categoriaId, subcategoriaId, status, prioridade, usuarioCriadorId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const params = new URLSearchParams({ tipo, take: String(PAGE_SIZE), skip: String((page - 1) * PAGE_SIZE) });
        if (fromISO) params.set("from", fromISO);
        if (toISO) params.set("to", toISO);
        if (categoriaId) params.set("categoriaId", categoriaId);
        if (subcategoriaId) params.set("subcategoriaId", subcategoriaId);
        if (status) params.set("status", status);
        if (prioridade) params.set("prioridade", prioridade);
        if (usuarioCriadorId) params.set("usuarioCriadorId", usuarioCriadorId);
        const res = await fetch(`/api/feedback?${params.toString()}`);
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(json?.error ?? "Não foi possível carregar os relatos.");
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
  }, [tipo, fromISO, toISO, categoriaId, subcategoriaId, status, prioridade, usuarioCriadorId, page, refreshToken]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const showPrioridade = tipo === "BUG";
  // Concordância de gênero: "bug" (masculino) vs "sugestão" (feminino) — nunca misturar
  // "Nenhum sugestão encontrado" (achado do teste ao vivo desta tarefa).
  const nenhumEncontradoLabel = tipo === "BUG" ? "Nenhum bug encontrado" : "Nenhuma sugestão encontrada";

  return (
    <Section
      title={tipo === "BUG" ? "Bugs" : "Sugestões"}
      action={
        data ? (
          <span className="text-xs text-nord-gray">
            {formatNumber(data.total)} encontrado{data.total === 1 ? "" : "s"}
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
            <div className="hidden md:block overflow-x-auto nord-scrollbar">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                    <th className="py-2 pr-4">Protocolo</th>
                    <th className="py-2 pr-4">Título</th>
                    <th className="py-2 pr-4">Módulo</th>
                    <th className="py-2 pr-4">Usuário</th>
                    <th className="py-2 pr-4">Data</th>
                    {showPrioridade && <th className="py-2 pr-4">Prioridade</th>}
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Responsável</th>
                    <th className="py-2 pr-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.reports.map((r) => (
                    <tr key={r.id} className="border-b border-nord-border/50 hover:bg-white/5">
                      <td className="py-2.5 pr-4 text-nord-gray font-mono whitespace-nowrap">{r.protocolo}</td>
                      <td className="py-2.5 pr-4 text-white max-w-xs truncate" title={r.titulo}>
                        <span className="inline-flex items-center gap-1.5">
                          {r.titulo}
                          {r.possivelDuplicataDeId && (
                            <Copy size={12} className="text-nord-gray shrink-0" aria-label="Possível duplicata" />
                          )}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-nord-gray max-w-[180px] truncate" title={resolveModuloLabel(r)}>
                        {resolveModuloLabel(r)}
                      </td>
                      <td className="py-2.5 pr-4 text-nord-gray">{r.usuarioCriador.name}</td>
                      <td className="py-2.5 pr-4 text-nord-gray whitespace-nowrap">{format(new Date(r.createdAt), "dd/MM/yyyy HH:mm")}</td>
                      {showPrioridade && (
                        <td className="py-2.5 pr-4">
                          <span className="text-xs font-medium" style={{ color: FEEDBACK_PRIORIDADE_COLOR[r.prioridade] }}>
                            {FEEDBACK_PRIORIDADE_LABEL[r.prioridade] ?? r.prioridade}
                          </span>
                        </td>
                      )}
                      <td className="py-2.5 pr-4">
                        <Badge tone={FEEDBACK_STATUS_TONE[r.status] ?? "default"}>{FEEDBACK_STATUS_LABEL[r.status] ?? r.status}</Badge>
                      </td>
                      <td className="py-2.5 pr-4 text-nord-gray">{r.responsavel?.name ?? "—"}</td>
                      <td className="py-2.5 pr-4">
                        <button
                          type="button"
                          onClick={() => onOpenDetail(r.id)}
                          className="inline-flex items-center gap-1 text-xs text-nord-blue-light hover:underline whitespace-nowrap"
                        >
                          <Eye size={13} /> Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                  {data.reports.length === 0 && (
                    <tr>
                      <td colSpan={showPrioridade ? 9 : 8} className="py-8 text-center text-nord-gray text-sm">
                        {nenhumEncontradoLabel} com os filtros selecionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-2">
              {data.reports.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onOpenDetail(r.id)}
                  className="w-full text-left nord-card p-3 border border-nord-border hover:border-nord-blue/60 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs text-nord-gray font-mono">{r.protocolo}</span>
                    <Badge tone={FEEDBACK_STATUS_TONE[r.status] ?? "default"}>{FEEDBACK_STATUS_LABEL[r.status] ?? r.status}</Badge>
                  </div>
                  <p className="text-white text-sm font-medium mt-1 flex items-center gap-1.5">
                    {r.titulo}
                    {r.possivelDuplicataDeId && <Copy size={12} className="text-nord-gray shrink-0" />}
                  </p>
                  <p className="text-xs text-nord-gray mt-1">{resolveModuloLabel(r)}</p>
                  <div className="flex items-center justify-between mt-2 text-[11px] text-nord-gray">
                    <span>{r.usuarioCriador.name}</span>
                    <span>{format(new Date(r.createdAt), "dd/MM/yyyy HH:mm")}</span>
                  </div>
                  {showPrioridade && (
                    <p className="text-[11px] font-medium mt-1" style={{ color: FEEDBACK_PRIORIDADE_COLOR[r.prioridade] }}>
                      Prioridade {FEEDBACK_PRIORIDADE_LABEL[r.prioridade] ?? r.prioridade}
                    </p>
                  )}
                </button>
              ))}
              {data.reports.length === 0 && (
                <p className="text-center text-nord-gray text-sm py-8">
                  {nenhumEncontradoLabel} com os filtros selecionados.
                </p>
              )}
            </div>

            {data.reports.length > 0 && (
              <div className="flex items-center justify-between mt-4 text-xs text-nord-gray flex-wrap gap-2">
                <span>
                  Página {page} de {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="btn-outline px-2.5 py-1 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
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
  );
}
