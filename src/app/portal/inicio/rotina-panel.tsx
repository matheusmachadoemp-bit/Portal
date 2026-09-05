"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ListTodo, ClipboardList, Users, Target, MessageCircleQuestion, CheckCircle2 } from "lucide-react";
import { Section, Badge } from "@/components/ui/stat-card";
import { FormError } from "@/components/ui/modal";

// ---------------------------------------------------------------------------
// "Minha rotina de hoje" — GET /api/inicio/rotina?empresaId=X. Diferente dos
// painéis de indicadores/desempenho (que dependem do período selecionado no
// topo da tela), esta rota é sempre "agora": não recebe parâmetro de período,
// então este painel só refaz a busca quando a loja ativa muda.
// ---------------------------------------------------------------------------

type RotinaItemTipo = "tarefa" | "checklist" | "reuniao" | "meta" | "pesquisa";

type RotinaItem = {
  tipo: RotinaItemTipo;
  horario: string | null;
  titulo: string;
  descricao: string | null;
  loja: string;
  setor: string | null;
  responsavel: string;
  prioridade: "URGENTE" | "ALTA" | "MEDIA" | "BAIXA" | null;
  status: string;
  prazo: string | null;
  atrasado: boolean;
  pontos: number | null;
  actionHref: string;
};

// "reuniao" nunca é retornado pela rota hoje (falta dado de horário nas
// reuniões mensais) — mantido aqui só para o Record ficar exaustivo.
const TIPO_ICON: Record<RotinaItemTipo, LucideIcon> = {
  tarefa: ListTodo,
  checklist: ClipboardList,
  reuniao: Users,
  meta: Target,
  pesquisa: MessageCircleQuestion,
};

const PRIORIDADE_LABEL: Record<NonNullable<RotinaItem["prioridade"]>, string> = {
  URGENTE: "Urgente",
  ALTA: "Alta",
  MEDIA: "Média",
  BAIXA: "Baixa",
};

const PRIORIDADE_TONE: Record<NonNullable<RotinaItem["prioridade"]>, "default" | "warning" | "danger"> = {
  URGENTE: "danger",
  ALTA: "warning",
  MEDIA: "default",
  BAIXA: "default",
};

/**
 * Texto do botão de ação por combinação tipo/status — o botão sempre navega
 * para `actionHref`; só o texto muda para soar natural conforme o que já foi
 * feito. Status possíveis por tipo (ver src/lib/inicio.ts):
 * - tarefa: PENDENTE, EM_ANDAMENTO, AGUARDANDO_VALIDACAO, ATRASADA (derivado)
 * - checklist: AGENDADO, DISPONIVEL, EM_ANDAMENTO, ATRASADO (só não-terminais
 *   chegam aqui — concluído/justificado/cancelado somem da rotina)
 * - meta: NAO_INICIADA, EM_ANDAMENTO, EM_RISCO, NAO_ATINGIDA
 * - pesquisa: PROGRAMADA, EM_ANDAMENTO (status da pesquisa, sempre não
 *   respondida pelo usuário — é por isso que aparece aqui)
 */
function actionLabel(item: RotinaItem): string {
  switch (item.tipo) {
    case "tarefa":
      if (item.status === "EM_ANDAMENTO") return "Continuar";
      if (item.status === "ATRASADA") return "Concluir";
      if (item.status === "AGUARDANDO_VALIDACAO" || item.status === "CONCLUIDA") return "Ver";
      return "Iniciar"; // PENDENTE
    case "checklist":
      if (item.status === "EM_ANDAMENTO") return "Continuar";
      if (item.status === "ATRASADO") return "Preencher agora";
      if (item.status === "DISPONIVEL") return "Preencher";
      return "Ver"; // AGENDADO (ainda não liberado) ou algum estado terminal residual
    case "pesquisa":
      return "Responder";
    case "meta":
    case "reuniao":
    default:
      return "Visualizar";
  }
}

function RowSkeleton() {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-nord-border animate-pulse">
      <div className="w-9 h-9 rounded-lg bg-white/5 shrink-0" />
      <div className="flex-1 space-y-2 py-0.5">
        <div className="h-2.5 w-16 bg-white/5 rounded" />
        <div className="h-3 w-2/3 bg-white/5 rounded" />
        <div className="h-2.5 w-1/3 bg-white/5 rounded" />
      </div>
      <div className="w-20 h-7 bg-white/5 rounded-lg shrink-0" />
    </div>
  );
}

export function RotinaPanel({ empresaId }: { empresaId: string }) {
  const [itens, setItens] = useState<RotinaItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inicio/rotina?empresaId=${encodeURIComponent(empresaId)}`);
      if (!res.ok) {
        setError("Não foi possível carregar sua rotina de hoje. Tente novamente em instantes.");
        return;
      }
      const data = await res.json();
      setItens(data.itens);
    } catch {
      setError("Não foi possível carregar sua rotina de hoje. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca a rotina ao montar e sempre que a loja ativa muda
    load();
  }, [load]);

  return (
    <Section
      title="Minha rotina de hoje"
      action={loading && itens ? <span className="text-xs text-nord-gray animate-pulse">Atualizando...</span> : undefined}
    >
      <FormError message={error} />

      {itens === null ? (
        loading ? (
          <div className="space-y-2">
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </div>
        ) : null
      ) : itens.length === 0 ? (
        <div className="flex items-center gap-2 py-2 text-sm text-nord-gray">
          <CheckCircle2 size={16} className="text-nord-success shrink-0" />
          Nenhuma atividade pendente por agora.
        </div>
      ) : (
        <div className="space-y-2">
          {itens.map((item, idx) => {
            const Icon = TIPO_ICON[item.tipo] ?? ListTodo;
            return (
              <div key={idx} className="flex items-start gap-3 p-3 rounded-xl border border-nord-border">
                <div className="w-9 h-9 rounded-lg bg-nord-blue/15 flex items-center justify-center text-nord-blue-light shrink-0">
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap mb-1 text-xs text-nord-gray">
                    <span>{item.horario ?? "Sem horário"}</span>
                    {item.atrasado && <Badge tone="danger">Atrasado</Badge>}
                    {item.prioridade && (
                      <Badge tone={PRIORIDADE_TONE[item.prioridade]}>{PRIORIDADE_LABEL[item.prioridade]}</Badge>
                    )}
                  </div>
                  <p className="text-sm text-white font-medium truncate">{item.titulo}</p>
                  {item.descricao && <p className="text-xs text-nord-gray line-clamp-2 mt-0.5">{item.descricao}</p>}
                  <p className="text-[11px] text-nord-gray mt-1 truncate">
                    {item.loja}
                    {item.setor ? ` • ${item.setor}` : ""}
                    {item.pontos != null ? ` • +${item.pontos} pontos` : ""}
                  </p>
                </div>
                <Link
                  href={item.actionHref}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium transition"
                >
                  {actionLabel(item)}
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
