/**
 * Constantes de exibição (rótulos, cores, tons) da Central de Bugs e Melhorias — painel
 * administrativo (Fase 3, Caio/design).
 *
 * Arquivo client-safe e SEM NENHUM import de Prisma/banco de propósito: os valores abaixo são
 * uma cópia, só para fins de UI, dos enums `FeedbackStatus` / `FeedbackPrioridade` /
 * `FeedbackCategoriaProblema` / `FeedbackImpacto` declarados em `prisma/schema.prisma` — a
 * validação de verdade (o que é aceito ou não em cada transição) continua inteiramente no
 * backend (`src/lib/feedback-server.ts`, `src/app/api/feedback/**`), nunca aqui. O agente de
 * design (Caio) não tem permissão para editar `prisma/schema.prisma` nem arquivos de
 * `src/lib/*` que leem/gravam banco — por isso esta lista é mantida manualmente em paralelo. Se
 * o enum mudar no schema (ex.: um status novo), este arquivo precisa ser atualizado junto.
 */

export type FeedbackStatusTone = "default" | "success" | "warning" | "danger" | "info";

export const FEEDBACK_STATUS_BY_TIPO: Record<"BUG" | "SUGESTAO", string[]> = {
  BUG: ["RECEBIDO", "EM_ANALISE", "EM_CORRECAO", "AGUARDANDO_VALIDACAO", "CORRIGIDO", "REABERTO", "NAO_REPRODUZIDO"],
  SUGESTAO: ["RECEBIDA", "EM_AVALIACAO", "APROVADA", "EM_DESENVOLVIMENTO", "IMPLEMENTADA", "RECUSADA"],
};

export const FEEDBACK_STATUS_LABEL: Record<string, string> = {
  RECEBIDO: "Recebido",
  EM_ANALISE: "Em análise",
  EM_CORRECAO: "Em correção",
  AGUARDANDO_VALIDACAO: "Aguardando validação",
  CORRIGIDO: "Corrigido",
  REABERTO: "Reaberto",
  NAO_REPRODUZIDO: "Não reproduzido",
  RECEBIDA: "Recebida",
  EM_AVALIACAO: "Em avaliação",
  APROVADA: "Aprovada",
  EM_DESENVOLVIMENTO: "Em desenvolvimento",
  IMPLEMENTADA: "Implementada",
  RECUSADA: "Recusada",
};

export const FEEDBACK_STATUS_TONE: Record<string, FeedbackStatusTone> = {
  RECEBIDO: "info",
  EM_ANALISE: "warning",
  EM_CORRECAO: "warning",
  AGUARDANDO_VALIDACAO: "warning",
  CORRIGIDO: "success",
  REABERTO: "danger",
  NAO_REPRODUZIDO: "default",
  RECEBIDA: "info",
  EM_AVALIACAO: "warning",
  APROVADA: "success",
  EM_DESENVOLVIMENTO: "warning",
  IMPLEMENTADA: "success",
  RECUSADA: "default",
};

/** Status que exigem `descricaoSolucao` preenchida antes da transição (mesma lista de
 * `FEEDBACK_STATUS_REQUIRES_SOLUCAO`, `src/lib/feedback-server.ts`) — usada aqui só pra desenhar
 * a UI (desabilitar o botão/avisar antes de tentar), a validação real é sempre do backend. */
export const FEEDBACK_STATUS_REQUIRES_SOLUCAO = new Set(["CORRIGIDO", "IMPLEMENTADA"]);

/**
 * Status terminal "de sucesso" por tipo — usados pela aba "Histórico de Atualizações" (bugs
 * corrigidos + melhorias implementadas, pedido original da Fase 3). Diferente de
 * `FEEDBACK_STATUS_TERMINAL` (backend, exposto também em `GET /api/feedback/dashboard` como
 * `statusTerminal`), que inclui também NAO_REPRODUZIDO/RECUSADA (terminal, mas "sem ação") — o
 * changelog só deve listar o desfecho positivo.
 */
export const FEEDBACK_STATUS_SUCESSO_BY_TIPO: Record<"BUG" | "SUGESTAO", string> = {
  BUG: "CORRIGIDO",
  SUGESTAO: "IMPLEMENTADA",
};

/** Cor hex equivalente a cada `tone` de `Badge` (`src/components/ui/stat-card.tsx`) — usada
 * para desenhar os botões de status em formato "pill" (mesmo padrão de `KANBAN_COLUMNS`,
 * `src/lib/manutencao.ts`: fundo sólido na cor quando selecionado, 13% de opacidade quando não). */
export const FEEDBACK_TONE_HEX: Record<FeedbackStatusTone, string> = {
  default: "#6b7280",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",
};

export const FEEDBACK_PRIORIDADE_OPTIONS = ["BAIXA", "MEDIA", "ALTA", "CRITICA"];

export const FEEDBACK_PRIORIDADE_LABEL: Record<string, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  CRITICA: "Crítica",
};

export const FEEDBACK_PRIORIDADE_COLOR: Record<string, string> = {
  BAIXA: "#9aa4b2",
  MEDIA: "#3b82f6",
  ALTA: "#f59e0b",
  CRITICA: "#ef4444",
};

export const FEEDBACK_IMPACTO_LABEL: Record<string, string> = {
  BAIXO: "Baixo",
  MEDIO: "Médio",
  ALTO: "Alto",
  CRITICO: "Crítico",
};

export const FEEDBACK_CATEGORIA_PROBLEMA_LABEL: Record<string, string> = {
  FUNCIONALIDADE_NAO_FUNCIONA: "Funcionalidade não funciona",
  INFORMACOES_INCORRETAS: "Informações incorretas",
  ERRO_VISUAL: "Erro visual ou de layout",
  LENTIDAO: "Lentidão",
  TRAVAMENTO: "Travamento",
  PROBLEMA_ACESSO: "Problema de acesso",
  ERRO_AO_SALVAR: "Erro ao salvar informações",
  OUTRO: "Outro",
};

/** Mesma prioridade de resolução usada por `resolveModuloLabel` no backend
 * (`src/app/api/feedback/dashboard/route.ts`): subcategoria > categoria > texto livre — garante
 * que o rótulo mostrado na coluna "Módulo" da tabela bate com as chaves de `porModulo` (gráfico
 * de Relatórios). */
export function resolveModuloLabel(report: {
  categoria: { name: string } | null;
  subcategoria: { name: string; category: { name: string } } | null;
  moduloAfetadoTexto: string | null;
}): string {
  if (report.subcategoria) return `${report.subcategoria.category.name} > ${report.subcategoria.name}`;
  if (report.categoria) return report.categoria.name;
  return report.moduloAfetadoTexto?.trim() || "Não informado";
}

/**
 * Horas (número fracionário vindo de `kpis.tempoMedio...Horas`) formatadas de um jeito legível:
 * minutos se < 1h, horas com 1 casa decimal se < 48h, dias (arredondado) acima disso. Quem
 * chama trata `null` (sem dado suficiente ainda) separadamente — nunca passar `null` aqui.
 */
export function formatHoras(horas: number): string {
  if (horas < 1) return `${Math.max(1, Math.round(horas * 60))} min`;
  if (horas < 48) return `${horas.toFixed(1).replace(".", ",")} h`;
  return `${Math.round(horas / 24)} dias`;
}

/** Converte o valor de "Módulo" escolhido no filtro (`""` | `"cat:<id>"` | `"sub:<id>"`) nos
 * parâmetros de querystring que `GET /api/feedback` espera. */
export function moduloFiltroToParams(value: string): { categoriaId?: string; subcategoriaId?: string } {
  if (value.startsWith("sub:")) return { subcategoriaId: value.slice(4) };
  if (value.startsWith("cat:")) return { categoriaId: value.slice(4) };
  return {};
}

/** Descreve uma linha de `historico[]` (`GET /api/feedback/[id]`) em uma frase legível.
 * `resolveUserName` resolve um id de usuário (campo RESPONSAVEL, que grava o id cru) para o
 * nome — recebe `null` para "ninguém". */
export function describeHistoricoEntry(
  h: { tipoAlteracao: string; valorAnterior: string | null; valorNovo: string | null },
  resolveUserName: (id: string | null) => string
): string {
  switch (h.tipoAlteracao) {
    case "STATUS":
      return `Status alterado de "${FEEDBACK_STATUS_LABEL[h.valorAnterior ?? ""] ?? h.valorAnterior ?? "—"}" para "${
        FEEDBACK_STATUS_LABEL[h.valorNovo ?? ""] ?? h.valorNovo ?? "—"
      }"`;
    case "PRIORIDADE":
      return `Prioridade alterada de "${FEEDBACK_PRIORIDADE_LABEL[h.valorAnterior ?? ""] ?? h.valorAnterior ?? "—"}" para "${
        FEEDBACK_PRIORIDADE_LABEL[h.valorNovo ?? ""] ?? h.valorNovo ?? "—"
      }"`;
    case "RESPONSAVEL":
      return `Responsável alterado de "${resolveUserName(h.valorAnterior)}" para "${resolveUserName(h.valorNovo)}"`;
    case "DESCRICAO_SOLUCAO":
      return "Descrição da solução atualizada";
    case "VERSAO_CORRIGIDA_EM":
      return `Versão corrigida em atualizada${h.valorNovo ? ` para "${h.valorNovo}"` : ""}`;
    default:
      return h.tipoAlteracao;
  }
}
