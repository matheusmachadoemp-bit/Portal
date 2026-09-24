"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { FormError } from "@/components/ui/modal";
import { apiRequest } from "@/lib/api-client";

type QuestionType = "NOTA_0_5" | "NOTA_0_10" | "GOSTEI_NAO_GOSTEI" | "TEXTO_LIVRE";
type StatusEnum = "NOVA" | "EM_ATENDIMENTO" | "RESOLVIDA";

const STATUS_LABEL: Record<StatusEnum, string> = { NOVA: "Nova", EM_ATENDIMENTO: "Em atendimento", RESOLVIDA: "Resolvida" };
const STATUS_TONE: Record<StatusEnum, "warning" | "info" | "success"> = {
  NOVA: "warning",
  EM_ATENDIMENTO: "info",
  RESOLVIDA: "success",
};

/** "tempo_espera" -> "Tempo espera" — mesmo helper de visao-geral-client.tsx (duplicado de
 *  propósito: não existe um utilitário compartilhado ainda pra isso, mesmo padrão já usado em
 *  outros pontos pequenos do portal). */
function formatTema(tema: string): string {
  const semUnderscore = tema.replace(/_/g, " ").trim();
  return semUnderscore.charAt(0).toUpperCase() + semUnderscore.slice(1);
}

type Resposta = {
  id: string;
  pergunta: { id: string; titulo: string; tema: string | null; tipo: QuestionType };
  valorNota: number | null;
  valorGostei: boolean | null;
  valorTexto: string | null;
};

type AvaliacaoDetail = {
  id: string;
  empresa: { id: string; name: string; color: string };
  submittedAt: string;
  mesa: { id: string; numero: string } | null;
  cliente: { id: string | null; nome: string; telefone: string; dataNascimento: string | null };
  garcomIndicado: { id: string; nome: string } | null;
  notaGeral: number;
  critica: boolean;
  sugestao: string | null;
  respostas: Resposta[];
  tratamento: {
    status: StatusEnum;
    responsavel: { id: string; nome: string } | null;
    assumidoEm: string | null;
    motivoTag: { id: string; nome: string } | null;
    resolucaoTexto: string | null;
    resolvidoEm: string | null;
  };
};

function RespostaItem({ r }: { r: Resposta }) {
  return (
    <div className="border-b border-nord-border/50 pb-3 last:border-0">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="text-sm text-white">{r.pergunta.titulo}</span>
        {r.pergunta.tema && <Badge tone="default">{formatTema(r.pergunta.tema)}</Badge>}
      </div>
      {r.pergunta.tipo === "GOSTEI_NAO_GOSTEI" ? (
        <div className="space-y-1">
          {r.valorGostei === null ? (
            <span className="text-nord-gray text-sm">Sem resposta</span>
          ) : r.valorGostei ? (
            <span className="inline-flex items-center gap-1 text-nord-success text-sm font-medium">
              <ThumbsUp size={13} /> Gostou
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-nord-danger text-sm font-medium">
              <ThumbsDown size={13} /> Não gostou
            </span>
          )}
          {r.valorTexto && <p className="text-nord-gray text-xs italic">&ldquo;{r.valorTexto}&rdquo;</p>}
        </div>
      ) : r.pergunta.tipo === "TEXTO_LIVRE" ? (
        r.valorTexto ? (
          <p className="text-white text-sm italic">&ldquo;{r.valorTexto}&rdquo;</p>
        ) : (
          <span className="text-nord-gray text-sm">Sem resposta</span>
        )
      ) : (
        <span className="text-white text-sm font-medium">
          {r.valorNota ?? "—"}/{r.pergunta.tipo === "NOTA_0_5" ? 5 : 10}
        </span>
      )}
    </div>
  );
}

export function AvaliacaoDetailClient({
  id,
  currentUserId,
  currentUserRole,
  canExecute,
}: {
  id: string;
  currentUserId: string;
  currentUserRole: string;
  canExecute: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<AvaliacaoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [assuming, setAssuming] = useState(false);
  const [resolucaoTexto, setResolucaoTexto] = useState("");
  const [motivoTagId, setMotivoTagId] = useState("");
  const [motivos, setMotivos] = useState<{ id: string; nome: string }[]>([]);
  const [resolving, setResolving] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/satisfacao-cliente/avaliacoes/${id}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setLoadError(json?.error ?? "Não foi possível carregar esta avaliação.");
        return;
      }
      setData(json.avaliacao);
    } catch {
      setLoadError("Falha de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carrega o detalhe no mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Motivos disponíveis pro seletor de "Registrar solução" (opcional) — sempre a loja DA PRÓPRIA
  // avaliação (`data.empresa.id`, via query `empresaId`), nunca a loja ativa do cookie: um
  // Administrador em modo Grupo Nord pode estar resolvendo uma avaliação de uma loja diferente da
  // selecionada no momento (mesmo raciocínio documentado em
  // src/app/api/satisfacao-cliente/motivos/route.ts). Busca assim que o detalhe carrega,
  // independente do status atual — fica pronta a tempo de quando o formulário aparecer (ex.: logo
  // após "Assumir atendimento", sem precisar de um segundo carregamento).
  useEffect(() => {
    if (!data?.empresa.id) return;
    let cancelled = false;
    fetch(`/api/satisfacao-cliente/motivos?empresaId=${data.empresa.id}`)
      .then((res) => (res.ok ? res.json() : { motivos: [] }))
      .then((json) => {
        if (!cancelled) setMotivos(json.motivos ?? []);
      })
      .catch(() => {
        if (!cancelled) setMotivos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [data?.empresa.id]);

  async function assumir() {
    if (assuming) return;
    setActionError(null);
    setAssuming(true);
    try {
      const result = await apiRequest(`/api/satisfacao-cliente/avaliacoes/${id}/assumir`, "POST");
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      await load();
      router.refresh();
    } finally {
      setAssuming(false);
    }
  }

  async function resolver() {
    if (resolving) return;
    if (!resolucaoTexto.trim()) {
      setActionError("Descreva como a situação foi resolvida.");
      return;
    }
    setActionError(null);
    setResolving(true);
    try {
      const result = await apiRequest(`/api/satisfacao-cliente/avaliacoes/${id}/resolver`, "POST", {
        resolucaoTexto: resolucaoTexto.trim(),
        motivoTagId: motivoTagId || null,
      });
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      setResolucaoTexto("");
      setMotivoTagId("");
      await load();
      // Avisa o resto do app (ex.: contador de alertas na Tela de Início) que o status mudou.
      router.refresh();
    } finally {
      setResolving(false);
    }
  }

  if (loading && !data) {
    return <div className="nord-card p-8 text-center text-sm text-nord-gray">Carregando...</div>;
  }
  if (loadError) {
    return <div className="nord-card p-8 text-center text-sm text-nord-danger">{loadError}</div>;
  }
  if (!data) return null;

  const isResponsavel = data.tratamento.responsavel?.id === currentUserId;
  const isAdmin = currentUserRole === "ADMINISTRADOR";
  const podeResolver = isResponsavel || isAdmin;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 space-y-6">
        <div className="nord-card p-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-white font-semibold text-lg">{data.cliente.nome}</h2>
              <p className="text-xs text-nord-gray mt-1">
                {format(new Date(data.submittedAt), "dd/MM/yyyy 'às' HH:mm")}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge tone={data.critica ? "danger" : "default"}>Nota {data.notaGeral}</Badge>
              <Badge tone={STATUS_TONE[data.tratamento.status]}>{STATUS_LABEL[data.tratamento.status]}</Badge>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-xs text-nord-gray">
            <span>
              Loja: <span className="text-white">{data.empresa.name}</span>
            </span>
            {data.mesa && (
              <span>
                Mesa: <span className="text-white">{data.mesa.numero}</span>
              </span>
            )}
            {data.garcomIndicado && (
              <span>
                Garçom indicado: <span className="text-white">{data.garcomIndicado.nome}</span>
              </span>
            )}
            {data.cliente.telefone && (
              <span>
                Telefone: <span className="text-white">{data.cliente.telefone}</span>
              </span>
            )}
          </div>
        </div>

        {data.sugestao && (
          <Section title="Sugestão do cliente">
            <p className="text-sm text-white italic">&ldquo;{data.sugestao}&rdquo;</p>
          </Section>
        )}

        <Section title="Respostas">
          <div className="space-y-3">
            {data.respostas.map((r) => (
              <RespostaItem key={r.id} r={r} />
            ))}
            {data.respostas.length === 0 && <p className="text-sm text-nord-gray">Nenhuma resposta registrada.</p>}
          </div>
        </Section>
      </div>

      <div className="space-y-6">
        <FormError message={actionError} />

        <Section title="Tratamento">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-nord-gray text-xs">Status atual</span>
              <Badge tone={STATUS_TONE[data.tratamento.status]}>{STATUS_LABEL[data.tratamento.status]}</Badge>
            </div>
            {data.tratamento.responsavel && (
              <p className="text-xs text-nord-gray">
                Assumida por <span className="text-white">{data.tratamento.responsavel.nome}</span>
                {data.tratamento.assumidoEm &&
                  ` em ${format(new Date(data.tratamento.assumidoEm), "dd/MM/yyyy 'às' HH:mm")}`}
              </p>
            )}
            {data.tratamento.status === "RESOLVIDA" && (
              <div className="pt-2 border-t border-nord-border space-y-2">
                {data.tratamento.motivoTag && (
                  <p className="text-xs text-nord-gray">
                    Motivo: <Badge tone="default">{data.tratamento.motivoTag.nome}</Badge>
                  </p>
                )}
                <div>
                  <p className="text-xs text-nord-gray mb-1">Solução aplicada</p>
                  <p className="text-white text-sm whitespace-pre-wrap">{data.tratamento.resolucaoTexto}</p>
                </div>
                {data.tratamento.resolvidoEm && (
                  <p className="text-[11px] text-nord-gray">
                    Resolvida em {format(new Date(data.tratamento.resolvidoEm), "dd/MM/yyyy 'às' HH:mm")}
                  </p>
                )}
              </div>
            )}
          </div>
        </Section>

        {data.tratamento.status === "NOVA" &&
          (canExecute ? (
            <button onClick={assumir} disabled={assuming} className="btn-primary w-full py-2.5 disabled:opacity-60">
              {assuming ? "Assumindo..." : "Assumir atendimento"}
            </button>
          ) : (
            <p className="text-xs text-nord-warning bg-nord-warning/10 border border-nord-warning/30 rounded-lg px-3 py-2">
              Seu perfil de permissão não permite assumir avaliações de Satisfação do Cliente.
            </p>
          ))}

        {data.tratamento.status === "EM_ATENDIMENTO" &&
          (canExecute && podeResolver ? (
            <Section title="Registrar solução">
              <div className="space-y-3">
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">O que foi feito para resolver a situação?</span>
                  <textarea
                    value={resolucaoTexto}
                    onChange={(e) => setResolucaoTexto(e.target.value)}
                    className="input w-full min-h-[90px]"
                    placeholder="Descreva o contato feito com o cliente e a solução oferecida..."
                  />
                </label>
                <label className="block">
                  <span className="block text-xs text-nord-gray mb-1">Motivo (opcional)</span>
                  <select value={motivoTagId} onChange={(e) => setMotivoTagId(e.target.value)} className="input w-full">
                    <option value="">Sem motivo selecionado</option>
                    {motivos.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={resolver}
                  disabled={resolving || !resolucaoTexto.trim()}
                  className="btn-primary w-full py-2.5 disabled:opacity-50"
                >
                  {resolving ? "Registrando..." : "Registrar solução"}
                </button>
              </div>
            </Section>
          ) : (
            <p className="text-xs text-nord-warning bg-nord-warning/10 border border-nord-warning/30 rounded-lg px-3 py-2">
              {canExecute
                ? `Esta avaliação está sendo tratada por ${
                    data.tratamento.responsavel?.nome ?? "outra pessoa"
                  }. Só quem assumiu (ou um Administrador) pode registrar a solução.`
                : "Seu perfil de permissão não permite tratar avaliações de Satisfação do Cliente."}
            </p>
          ))}
      </div>
    </div>
  );
}
