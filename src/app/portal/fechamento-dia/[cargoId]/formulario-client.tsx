"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, PenLine, RefreshCw } from "lucide-react";
import {
  fechamentoPerguntaObrigatoriaAgora,
  fechamentoPerguntasFaltando,
  fechamentoRespostaEstaPreenchida,
  fechamentoValorParaComparacaoCondicional,
} from "@/lib/fechamento";
import type { FechamentoPerguntaValidacao, FechamentoRespostaInput } from "@/lib/fechamento";
import { DynamicIcon } from "@/components/dynamic-icon";
import { ProgressBar } from "@/components/ui/stat-card";
import { FormError } from "@/components/ui/modal";
import { formatHora } from "../format";
import { PerguntaItem, type PerguntaDTO } from "./pergunta-item";

// ---------------------------------------------------------------------------
// GET /api/fechamento-dia/cargos/[cargoId]/perguntas devolve o catálogo de
// perguntas do cargo + a submissão de hoje já existente (se houver). Este
// componente é a MESMA tela para qualquer cargo — nada aqui é específico de
// Gerente/Salão/Cozinha, tudo vem dos dados.
// ---------------------------------------------------------------------------

type Pessoa = { id: string; name: string };

type RespostaSalva = FechamentoRespostaInput & { perguntaId: string };

type SubmissaoAtualDTO = {
  status: "PENDENTE" | "ENVIADO" | "ATRASADO";
  enviadoEm: string | null;
  dueAt: string;
  notaGeral: number | null;
  respostas: RespostaSalva[];
} | null;

type PerguntasResponse = {
  cargo: {
    id: string;
    key: string;
    nome: string;
    icon: string;
    empresa: { id: string; name: string };
    horarioLiberacao: string;
    horarioLimite: string;
  };
  perguntas: PerguntaDTO[];
  podeExecutar: boolean;
  date: string;
  submissaoAtual: SubmissaoAtualDTO;
};

/** Visibilidade de uma pergunta condicional — mesma regra usada pela rota de submissão (ver `fechamentoValorParaComparacaoCondicional`, @/lib/fechamento), só que aqui a decisão é lida a partir do estado local em vez do banco. */
function perguntaVisivel(
  pergunta: PerguntaDTO,
  perguntasPorId: Map<string, PerguntaDTO>,
  opcaoTextoPorId: Map<string, string>,
  respostas: Record<string, FechamentoRespostaInput>
): boolean {
  if (!pergunta.perguntaPaiId) return true;
  const pai = perguntasPorId.get(pergunta.perguntaPaiId);
  if (!pai) return false;
  const respostaPai = respostas[pai.id];
  const opcaoTextoPai = respostaPai?.opcaoId ? opcaoTextoPorId.get(respostaPai.opcaoId) ?? null : null;
  const valorPai = fechamentoValorParaComparacaoCondicional(pai.tipo, {
    valorBooleano: respostaPai?.valorBooleano,
    opcaoId: respostaPai?.opcaoId,
    opcaoTexto: opcaoTextoPai,
  });
  return valorPai != null && valorPai === pergunta.valorPaiQueExibe;
}

/** Remove a resposta de qualquer pergunta filha que deixou de estar visível (pai respondido de novo com outro valor) — repete até estabilizar, para lidar com cadeias de mais de um nível. */
function podarRespostasEscondidas(
  respostas: Record<string, FechamentoRespostaInput>,
  perguntas: PerguntaDTO[],
  perguntasPorId: Map<string, PerguntaDTO>,
  opcaoTextoPorId: Map<string, string>
): Record<string, FechamentoRespostaInput> {
  let atual = respostas;
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const p of perguntas) {
      if (p.perguntaPaiId && p.id in atual && !perguntaVisivel(p, perguntasPorId, opcaoTextoPorId, atual)) {
        atual = { ...atual };
        delete atual[p.id];
        mudou = true;
      }
    }
  }
  return atual;
}

function FormSkeleton() {
  return (
    <div className="space-y-3">
      <div className="nord-card p-4 h-20 animate-pulse bg-white/5" />
      <div className="nord-card p-4 h-28 animate-pulse bg-white/5" />
      <div className="nord-card p-4 h-28 animate-pulse bg-white/5" />
    </div>
  );
}

export function FormularioClient({ cargoId, produtos, colaboradores }: { cargoId: string; produtos: Pessoa[]; colaboradores: Pessoa[] }) {
  const [data, setData] = useState<PerguntasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modo, setModo] = useState<"view" | "edit">("view");
  const [respostas, setRespostas] = useState<Record<string, FechamentoRespostaInput>>({});
  const [perguntasComErro, setPerguntasComErro] = useState<Set<string>>(new Set());
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [enviado, setEnviado] = useState<{ enviadoEm: string; atrasado: boolean } | null>(null);

  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/fechamento-dia/cargos/${cargoId}/perguntas`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(body.error || "Não foi possível carregar o formulário. Tente novamente em instantes.");
        return;
      }
      const resposta = body as PerguntasResponse;
      setData(resposta);
      if (resposta.submissaoAtual) {
        const iniciais: Record<string, FechamentoRespostaInput> = {};
        for (const r of resposta.submissaoAtual.respostas) {
          iniciais[r.perguntaId] = {
            valorBooleano: r.valorBooleano,
            valorTexto: r.valorTexto,
            valorNumero: r.valorNumero,
            valorNota: r.valorNota,
            opcaoId: r.opcaoId,
            produtoId: r.produtoId,
            colaboradorId: r.colaboradorId,
            fotoUrl: r.fotoUrl,
            anexoUrl: r.anexoUrl,
          };
        }
        setRespostas(iniciais);
        setModo("view");
      } else {
        setRespostas({});
        setModo(resposta.podeExecutar ? "edit" : "view");
      }
      setPerguntasComErro(new Set());
      setSubmitError(null);
    } catch {
      setLoadError("Não foi possível carregar o formulário. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }, [cargoId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca o formulário do cargo ao montar a tela
    load();
  }, [load]);

  const perguntas = useMemo(() => data?.perguntas ?? [], [data]);
  const perguntasPorId = useMemo(() => new Map(perguntas.map((p) => [p.id, p])), [perguntas]);
  const opcaoTextoPorId = useMemo(() => new Map(perguntas.flatMap((p) => p.opcoes.map((o) => [o.id, o.texto] as const))), [perguntas]);
  const validacaoPorId = useMemo(() => {
    const lista: FechamentoPerguntaValidacao[] = perguntas.map((p) => ({
      id: p.id,
      texto: p.texto,
      tipo: p.tipo,
      obrigatoria: p.obrigatoria,
      perguntaPaiId: p.perguntaPaiId,
      valorPaiQueExibe: p.valorPaiQueExibe,
    }));
    return new Map(lista.map((p) => [p.id, p]));
  }, [perguntas]);

  const visiveis = useMemo(
    () => perguntas.filter((p) => perguntaVisivel(p, perguntasPorId, opcaoTextoPorId, respostas)),
    [perguntas, perguntasPorId, opcaoTextoPorId, respostas]
  );
  const respostaPorPerguntaIdMap = useMemo(() => new Map(Object.entries(respostas)), [respostas]);
  const respondidasCount = visiveis.filter((p) => fechamentoRespostaEstaPreenchida(p.tipo, respostas[p.id])).length;
  const progresso = visiveis.length > 0 ? Math.round((respondidasCount / visiveis.length) * 100) : 100;

  function handleChange(perguntaId: string, patch: FechamentoRespostaInput) {
    setRespostas((prev) => {
      const proximo = { ...prev, [perguntaId]: { ...prev[perguntaId], ...patch } };
      return podarRespostasEscondidas(proximo, perguntas, perguntasPorId, opcaoTextoPorId);
    });
    setPerguntasComErro((prev) => {
      if (!prev.has(perguntaId)) return prev;
      const proximo = new Set(prev);
      proximo.delete(perguntaId);
      return proximo;
    });
  }

  function destacarFaltantes(mensagens: string[]) {
    const ids = new Set<string>();
    for (const p of perguntas) {
      if (mensagens.some((m) => m === p.texto || m.includes(`"${p.texto}"`))) ids.add(p.id);
    }
    setPerguntasComErro(ids);
    setSubmitError(
      mensagens.length === 1
        ? "Falta 1 resposta obrigatória. Veja o campo destacado abaixo."
        : `Faltam ${mensagens.length} respostas obrigatórias. Veja os campos destacados abaixo.`
    );
    const primeiraOrdem = perguntas.find((p) => ids.has(p.id));
    if (primeiraOrdem) {
      requestAnimationFrame(() => {
        cardRefs.current[primeiraOrdem.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }

  async function handleSubmit() {
    setSubmitError(null);

    const faltando = fechamentoPerguntasFaltando([...validacaoPorId.values()], respostaPorPerguntaIdMap, opcaoTextoPorId);
    if (faltando.length > 0) {
      destacarFaltantes(faltando);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/fechamento-dia/cargos/${cargoId}/submissoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respostas: Object.entries(respostas).map(([perguntaId, r]) => ({ perguntaId, ...r })) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 400 && Array.isArray(body.perguntasFaltando)) {
          destacarFaltantes(body.perguntasFaltando);
        } else {
          setSubmitError(body.error || "Não foi possível enviar o fechamento. Tente novamente.");
        }
        return;
      }
      setEnviado({ enviadoEm: body.submissao.enviadoEm, atrasado: !!body.atrasado });
      await load();
    } catch {
      setSubmitError("Não foi possível enviar o fechamento. Verifique sua conexão e tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="nord-card p-4 h-16 animate-pulse bg-white/5" />
        <FormSkeleton />
      </div>
    );
  }

  if (loadError && !data) {
    return (
      <div className="max-w-2xl mx-auto nord-card p-6 text-center space-y-3">
        <AlertTriangle className="mx-auto text-red-400" size={28} />
        <p className="text-sm text-red-300">{loadError}</p>
        <div className="flex items-center justify-center gap-4">
          <button type="button" onClick={load} className="btn-outline">
            <RefreshCw size={13} /> Tentar de novo
          </button>
          <Link href="/portal/fechamento-dia" className="text-xs text-nord-gray hover:text-white">
            Voltar ao status do dia
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { cargo } = data;
  const mostrarFormulario = (modo === "edit" || !!data.submissaoAtual) && visiveis.length > 0;

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-10">
      <div className="nord-card p-4 flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-nord-blue/15 flex items-center justify-center shrink-0">
          <DynamicIcon name={cargo.icon} size={22} className="text-nord-blue-light" />
        </div>
        <div className="min-w-0">
          <p className="text-white font-semibold truncate">{cargo.nome}</p>
          <p className="text-xs text-nord-gray truncate">
            {cargo.empresa.name} · Expediente {cargo.horarioLiberacao}–{cargo.horarioLimite}
          </p>
        </div>
      </div>

      {enviado && (
        <div className="nord-card p-6 text-center border-emerald-500/40 bg-emerald-500/5 space-y-2">
          <CheckCircle2 size={28} className="text-emerald-400 mx-auto" />
          <p className="text-white font-medium">Fechamento enviado às {formatHora(enviado.enviadoEm)}</p>
          <p className="text-sm text-nord-gray">
            {enviado.atrasado ? "Enviado com atraso, mas já está registrado." : "Enviado dentro do prazo."}
          </p>
          <Link
            href="/portal/fechamento-dia"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-nord-blue hover:bg-nord-blue-light text-white transition mt-1"
          >
            Voltar ao status do dia
          </Link>
        </div>
      )}

      {modo === "view" && data.submissaoAtual && (
        <div className="nord-card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 size={16} className="text-nord-success shrink-0" />
            <span className="text-white">
              {data.submissaoAtual.enviadoEm ? (
                <>
                  Enviado às {formatHora(data.submissaoAtual.enviadoEm)} ·{" "}
                  {new Date(data.submissaoAtual.enviadoEm).getTime() > new Date(data.submissaoAtual.dueAt).getTime()
                    ? "com atraso"
                    : "no prazo"}
                </>
              ) : (
                "Enviado"
              )}
            </span>
          </div>
          {data.podeExecutar && (
            <button
              type="button"
              onClick={() => {
                setModo("edit");
                setEnviado(null);
              }}
              className="btn-outline w-fit"
            >
              <PenLine size={13} /> Editar resposta
            </button>
          )}
        </div>
      )}

      {!data.podeExecutar && !data.submissaoAtual && (
        <div className="nord-card p-6 text-center text-sm text-nord-gray">
          Seu perfil pode visualizar este cargo, mas ainda não tem permissão para preenchê-lo. Assim que o responsável enviar o fechamento de
          hoje, o feedback aparece aqui.
        </div>
      )}

      {data.podeExecutar && !data.submissaoAtual && perguntas.length === 0 && (
        <div className="nord-card p-6 text-center text-sm text-nord-gray">Nenhuma pergunta configurada para este cargo ainda.</div>
      )}

      {mostrarFormulario && (
        <>
          {modo === "edit" && (
            <div className="sticky top-16 z-10 nord-card p-3 backdrop-blur bg-nord-card/95">
              <div className="flex items-center justify-between text-xs text-nord-gray mb-1.5">
                <span>
                  {respondidasCount} de {visiveis.length} perguntas respondidas
                </span>
                <span>{progresso}%</span>
              </div>
              <ProgressBar percent={progresso} />
            </div>
          )}

          <FormError message={submitError} />

          <div className="space-y-3">
            {visiveis.map((p) => (
              <div
                key={p.id}
                ref={(el) => {
                  cardRefs.current[p.id] = el;
                }}
              >
                <PerguntaItem
                  pergunta={p}
                  valor={respostas[p.id]}
                  onChange={handleChange}
                  readOnly={modo === "view"}
                  obrigatoriaAgora={fechamentoPerguntaObrigatoriaAgora(p, validacaoPorId, respostaPorPerguntaIdMap, opcaoTextoPorId)}
                  destacarErro={perguntasComErro.has(p.id)}
                  produtos={produtos}
                  colaboradores={colaboradores}
                  indent={!!p.perguntaPaiId}
                />
              </div>
            ))}
          </div>

          {modo === "edit" && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-lg text-sm font-semibold bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white transition"
            >
              {submitting && <Loader2 size={15} className="animate-spin" />}
              Enviar feedback
            </button>
          )}
        </>
      )}
    </div>
  );
}
