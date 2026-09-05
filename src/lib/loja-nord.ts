/**
 * Constantes e helpers compartilhados do módulo Loja Nord (pontos e
 * recompensas dos colaboradores). Segue o mesmo padrão de `src/lib/university.ts`.
 */

export const LOJA_NORD_LEVELS = [
  { key: "INICIANTE", label: "Iniciante", minPontos: 0, color: "#9aa4b2" },
  { key: "BRONZE", label: "Bronze", minPontos: 500, color: "#b45309" },
  { key: "PRATA", label: "Prata", minPontos: 1500, color: "#94a3b8" },
  { key: "OURO", label: "Ouro", minPontos: 3500, color: "#eab308" },
  { key: "DIAMANTE", label: "Diamante", minPontos: 7000, color: "#38bdf8" },
] as const;

/** Nível de reconhecimento com base nos pontos ganhos ao longo da vida do colaborador (não o saldo atual, que cai ao resgatar). */
export function levelForPontos(pontosGanhosTotal: number) {
  let current: (typeof LOJA_NORD_LEVELS)[number] = LOJA_NORD_LEVELS[0];
  for (const lvl of LOJA_NORD_LEVELS) {
    if (pontosGanhosTotal >= lvl.minPontos) current = lvl;
  }
  return current;
}

export function nextLevelForPontos(pontosGanhosTotal: number) {
  const idx = LOJA_NORD_LEVELS.findIndex((l) => l.key === levelForPontos(pontosGanhosTotal).key);
  return LOJA_NORD_LEVELS[idx + 1] ?? null;
}

export const LOJA_NORD_REWARD_CATEGORY_LABEL: Record<string, string> = {
  EXPERIENCIAS: "Experiências",
  FOLGAS_BENEFICIOS: "Folgas e benefícios",
  BEBIDAS: "Bebidas",
  ELETRONICOS: "Eletrônicos",
  PRODUTOS_NORD: "Produtos Nord",
  VALE_CONSUMO: "Vale-consumo",
};

export const LOJA_NORD_REWARD_CATEGORY_OPTIONS = Object.entries(LOJA_NORD_REWARD_CATEGORY_LABEL).map(
  ([key, label]) => ({ key, label })
);

export const LOJA_NORD_TRANSACTION_KIND_LABEL: Record<string, string> = {
  GANHO: "Pontos ganhos",
  BONIFICACAO: "Bonificação",
  RESGATE: "Resgate",
  AJUSTE_POSITIVO: "Ajuste (crédito)",
  AJUSTE_NEGATIVO: "Ajuste (débito)",
  ESTORNO: "Estorno",
  EXPIRACAO: "Expiração",
};

export type BadgeTone = "default" | "success" | "warning" | "danger" | "info";

export const LOJA_NORD_TRANSACTION_KIND_TONE: Record<string, BadgeTone> = {
  GANHO: "success",
  BONIFICACAO: "success",
  ESTORNO: "success",
  RESGATE: "danger",
  AJUSTE_POSITIVO: "success",
  AJUSTE_NEGATIVO: "danger",
  EXPIRACAO: "warning",
};

export const LOJA_NORD_REDEMPTION_STATUS_LABEL: Record<string, string> = {
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  APROVADO: "Aprovado",
  DISPONIVEL_RETIRADA: "Disponível para retirada",
  ENTREGUE: "Entregue",
  RECUSADO: "Recusado",
  CANCELADO: "Cancelado",
};

export const LOJA_NORD_REDEMPTION_STATUS_TONE: Record<string, BadgeTone> = {
  AGUARDANDO_APROVACAO: "warning",
  APROVADO: "info",
  DISPONIVEL_RETIRADA: "info",
  ENTREGUE: "success",
  RECUSADO: "danger",
  CANCELADO: "default",
};

/** Regras de pontuação padrão sugeridas na tela de configuração (ponto de partida, editável pelo admin). */
export const LOJA_NORD_DEFAULT_RULES = [
  { activityType: "TAREFA_SIMPLES", label: "Tarefa simples concluída", pontos: 10 },
  { activityType: "TAREFA_PRIORITARIA", label: "Tarefa prioritária concluída", pontos: 30 },
  { activityType: "CHECKLIST_NO_HORARIO", label: "Checklist concluído no horário", pontos: 20 },
  { activityType: "CHECKLIST_ATRASADO", label: "Checklist atrasado", pontos: 5 },
  { activityType: "CURSO_CONCLUIDO", label: "Curso concluído", pontos: 100 },
  { activityType: "AVALIACAO_APROVADA", label: "Avaliação aprovada", pontos: 50 },
  { activityType: "SEQUENCIA_SEMANAL", label: "Sequência semanal sem atraso", pontos: 100 },
] as const;

export function estoqueBadge(estoque: number | null, estoqueMinimo: number | null): { label: string; tone: BadgeTone } {
  if (estoque === null) return { label: "Disponível", tone: "success" };
  if (estoque <= 0) return { label: "Sem estoque", tone: "danger" };
  if (estoqueMinimo !== null && estoque <= estoqueMinimo) return { label: "Últimas unidades", tone: "warning" };
  return { label: "Disponível", tone: "success" };
}
