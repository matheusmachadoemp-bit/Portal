export const GOAL_CATEGORIES = ["GERENCIA", "SALAO", "COZINHA", "DELIVERY", "MARKETING", "ADMINISTRATIVO"] as const;
export type GoalCategoryKey = (typeof GOAL_CATEGORIES)[number];

export const GOAL_CATEGORY_LABEL: Record<GoalCategoryKey, string> = {
  GERENCIA: "Gerência",
  SALAO: "Salão",
  COZINHA: "Cozinha",
  DELIVERY: "Delivery",
  MARKETING: "Marketing",
  ADMINISTRATIVO: "Administrativo",
};

export const GOAL_STATUS_LABEL: Record<string, string> = {
  NAO_INICIADA: "Não iniciada",
  EM_ANDAMENTO: "Em andamento",
  EM_RISCO: "Próxima de atingir",
  CONCLUIDA: "Concluída",
  NAO_ATINGIDA: "Não atingida",
};

export const GOAL_STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  NAO_INICIADA: "default",
  EM_ANDAMENTO: "info",
  EM_RISCO: "warning",
  CONCLUIDA: "success",
  NAO_ATINGIDA: "danger",
};

const NEAR_TARGET_THRESHOLD = 90;

/**
 * A meta muda de status automaticamente conforme o progresso e o prazo —
 * ver seção 1 do escopo (o status nunca é escolhido manualmente).
 */
export function computeGoalStatus(
  valorRealizado: number,
  valorMeta: number,
  endDate: Date,
  now: Date = new Date()
): keyof typeof GOAL_STATUS_LABEL {
  const percent = valorMeta > 0 ? (valorRealizado / valorMeta) * 100 : 0;
  if (percent >= 100) return "CONCLUIDA";
  if (now.getTime() > endDate.getTime()) return "NAO_ATINGIDA";
  if (percent >= NEAR_TARGET_THRESHOLD) return "EM_RISCO";
  if (valorRealizado > 0) return "EM_ANDAMENTO";
  return "NAO_INICIADA";
}
