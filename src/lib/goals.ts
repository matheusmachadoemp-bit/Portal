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

/**
 * Toda meta vale por um mês inteiro (dia 1 ao último dia). Esses helpers
 * convertem entre o "YYYY-MM" do seletor de mês e as datas de início/fim
 * que o Goal guarda no banco.
 */
export function monthToDateRange(month: string): { startDate: string; endDate: string } {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIdx = Number(monthStr) - 1;
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    startDate: `${year}-${pad(monthIdx + 1)}-01`,
    endDate: `${year}-${pad(monthIdx + 1)}-${pad(lastDay)}`,
  };
}

export function dateToMonth(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function currentMonth(): string {
  return dateToMonth(new Date());
}

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
