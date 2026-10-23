"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Eye } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { formatNumber } from "@/lib/calc";
import { FEEDBACK_STATUS_SUCESSO_BY_TIPO, resolveModuloLabel } from "./labels";
import type { FeedbackListItem } from "./types";

/**
 * Aba "Histórico de Atualizações" (changelog) — bugs corrigidos + melhorias implementadas, nunca
 * excluídos (o backend não tem rota de exclusão de `FeedbackReport`, ver `src/lib/feedback-
 * server.ts`/`src/app/api/feedback/**` — esta tela só não esconde isso). Busca duas listagens
 * separadas (`GET /api/feedback?tipo=BUG&status=CORRIGIDO` e `tipo=SUGESTAO&status=IMPLEMENTADA`)
 * porque a API só aceita um único valor de `status` por chamada — mescla e ordena por data de
 * conclusão (mais recente primeiro). Respeita período, módulo (`categoriaId`/`subcategoriaId`) e
 * usuário (`usuarioCriadorId`), os três repassados direto pra API em cada uma das duas chamadas.
 * Filtro de "Versão" é só client-side (a API não tem esse parâmetro) sobre a lista já carregada.
 */
export function FeedbackHistoricoTab({
  fromISO,
  toISO,
  categoriaId,
  subcategoriaId,
  usuarioCriadorId,
  refreshToken,
  onOpenDetail,
}: {
  fromISO?: string;
  toISO?: string;
  categoriaId?: string;
  subcategoriaId?: string;
  usuarioCriadorId?: string;
  refreshToken: number;
  onOpenDetail: (id: string) => void;
}) {
  const [items, setItems] = useState<FeedbackListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [versaoFiltro, setVersaoFiltro] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        function buildParams(tipo: "BUG" | "SUGESTAO") {
          const params = new URLSearchParams({
            tipo,
            status: FEEDBACK_STATUS_SUCESSO_BY_TIPO[tipo],
            take: "300",
          });
          if (fromISO) params.set("from", fromISO);
          if (toISO) params.set("to", toISO);
          if (categoriaId) params.set("categoriaId", categoriaId);
          if (subcategoriaId) params.set("subcategoriaId", subcategoriaId);
          if (usuarioCriadorId) params.set("usuarioCriadorId", usuarioCriadorId);
          return params;
        }
        const [resBugs, resSugestoes] = await Promise.all([
          fetch(`/api/feedback?${buildParams("BUG").toString()}`),
          fetch(`/api/feedback?${buildParams("SUGESTAO").toString()}`),
        ]);
        const [jsonBugs, jsonSugestoes] = await Promise.all([
          resBugs.json().catch(() => null),
          resSugestoes.json().catch(() => null),
        ]);
        if (cancelled) return;
        if (!resBugs.ok || !resSugestoes.ok) {
          setLoadError(jsonBugs?.error ?? jsonSugestoes?.error ?? "Não foi possível carregar o histórico de atualizações.");
          return;
        }
        const merged: FeedbackListItem[] = [...(jsonBugs?.reports ?? []), ...(jsonSugestoes?.reports ?? [])];
        merged.sort((a, b) => {
          const da = a.dataConclusao ? new Date(a.dataConclusao).getTime() : 0;
          const db = b.dataConclusao ? new Date(b.dataConclusao).getTime() : 0;
          return db - da;
        });
        setItems(merged);
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
  }, [fromISO, toISO, categoriaId, subcategoriaId, usuarioCriadorId, refreshToken]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const termo = versaoFiltro.trim().toLowerCase();
    if (!termo) return items;
    return items.filter((r) => (r.versaoCorrigidaEm ?? "").toLowerCase().includes(termo));
  }, [items, versaoFiltro]);

  return (
    <Section
      title="Histórico de Atualizações"
      action={
        items ? (
          <span className="text-xs text-nord-gray">
            {formatNumber(filtered.length)} registro{filtered.length === 1 ? "" : "s"}
            {loading ? " · atualizando..." : ""}
          </span>
        ) : undefined
      }
    >
      <div className="mb-3">
        <input
          value={versaoFiltro}
          onChange={(e) => setVersaoFiltro(e.target.value)}
          placeholder="Filtrar por versão (ex.: v1.4.2)"
          className="input w-full sm:w-64"
        />
      </div>

      {loading && !items ? (
        <div className="p-8 text-center text-sm text-nord-gray">Carregando...</div>
      ) : loadError ? (
        <div className="p-8 text-center text-sm text-nord-danger">{loadError}</div>
      ) : (
        <>
          <div className="hidden md:block overflow-x-auto nord-scrollbar">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-nord-gray border-b border-nord-border">
                  <th className="py-2 pr-4">Protocolo</th>
                  <th className="py-2 pr-4">Título</th>
                  <th className="py-2 pr-4">Tipo</th>
                  <th className="py-2 pr-4">Módulo</th>
                  <th className="py-2 pr-4">Responsável</th>
                  <th className="py-2 pr-4">Data da correção</th>
                  <th className="py-2 pr-4">Versão</th>
                  <th className="py-2 pr-4">Solução aplicada</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-nord-border/50 hover:bg-white/5 align-top">
                    <td className="py-2.5 pr-4 text-nord-gray font-mono whitespace-nowrap">{r.protocolo}</td>
                    <td className="py-2.5 pr-4 text-white max-w-[200px] truncate" title={r.titulo}>{r.titulo}</td>
                    <td className="py-2.5 pr-4">
                      <Badge tone={r.tipo === "BUG" ? "danger" : "warning"}>{r.tipo === "BUG" ? "Bug" : "Sugestão"}</Badge>
                    </td>
                    <td className="py-2.5 pr-4 text-nord-gray max-w-[160px] truncate" title={resolveModuloLabel(r)}>
                      {resolveModuloLabel(r)}
                    </td>
                    <td className="py-2.5 pr-4 text-nord-gray">{r.responsavel?.name ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-nord-gray whitespace-nowrap">
                      {r.dataConclusao ? format(new Date(r.dataConclusao), "dd/MM/yyyy HH:mm") : "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-nord-gray whitespace-nowrap">{r.versaoCorrigidaEm ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-nord-gray max-w-[260px] truncate" title={r.descricaoSolucao ?? undefined}>
                      {r.descricaoSolucao ?? "—"}
                    </td>
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
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-nord-gray text-sm">
                      Nenhum registro de bug corrigido ou melhoria implementada encontrado com os filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2">
            {filtered.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onOpenDetail(r.id)}
                className="w-full text-left nord-card p-3 border border-nord-border hover:border-nord-blue/60 transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs text-nord-gray font-mono">{r.protocolo}</span>
                  <Badge tone={r.tipo === "BUG" ? "danger" : "warning"}>{r.tipo === "BUG" ? "Bug" : "Sugestão"}</Badge>
                </div>
                <p className="text-white text-sm font-medium mt-1">{r.titulo}</p>
                <p className="text-xs text-nord-gray mt-1">{resolveModuloLabel(r)}</p>
                <div className="flex items-center justify-between mt-2 text-[11px] text-nord-gray">
                  <span>{r.responsavel?.name ?? "Sem responsável"}</span>
                  <span>{r.dataConclusao ? format(new Date(r.dataConclusao), "dd/MM/yyyy") : "—"}</span>
                </div>
                {r.versaoCorrigidaEm && <p className="text-[11px] text-nord-gray mt-1">Versão {r.versaoCorrigidaEm}</p>}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-nord-gray text-sm py-8">
                Nenhum registro de bug corrigido ou melhoria implementada encontrado com os filtros selecionados.
              </p>
            )}
          </div>
        </>
      )}
    </Section>
  );
}
