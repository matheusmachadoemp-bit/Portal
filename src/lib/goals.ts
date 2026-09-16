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

/** Cor padrão de cada setor — usada em qualquer lugar que precise diferenciar setor visualmente (ex.: badge na tabela de checklists). */
export const GOAL_CATEGORY_COLOR: Record<GoalCategoryKey, string> = {
  GERENCIA: "#2952E3",
  SALAO: "#22c55e",
  COZINHA: "#f97316",
  DELIVERY: "#a855f7",
  MARKETING: "#ec4899",
  ADMINISTRATIVO: "#64748b",
};

export const GOAL_CATEGORY_ROUTE: Record<GoalCategoryKey, string> = {
  GERENCIA: "gerencia",
  SALAO: "salao",
  COZINHA: "cozinha",
  DELIVERY: "delivery",
  MARKETING: "marketing",
  ADMINISTRATIVO: "administrativo",
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

/**
 * Quantas "semanas" (blocos de até 7 dias, contados a partir do dia 1 do
 * período da meta) cabem no período de uma meta — sempre 4 ou 5, já que toda
 * `Goal` vale por um mês calendário inteiro (28 a 31 dias). Usado tanto para
 * validar `GoalWeeklyUpdate.weekNumber` (nunca pode passar desse total) quanto
 * para a tela (Caio) montar os cards/inputs de cada semana do mês.
 */
export function weeksInGoalPeriod(startDate: Date, endDate: Date): number {
  const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  return Math.max(1, Math.ceil(totalDays / 7));
}

/**
 * Intervalo de dias (base 1, relativo ao início do período da meta) de uma
 * semana específica — ex.: semana 2 de um mês de 30 dias = dias 8 a 14; a
 * última semana do mês pode ter menos de 7 dias (ex.: semana 5 de um mês de
 * 31 dias = só o dia 29 a 31, 3 dias).
 */
export function weekDayRange(weekNumber: number, totalDays: number): { startDay: number; endDay: number } {
  const startDay = (weekNumber - 1) * 7 + 1;
  const endDay = Math.min(weekNumber * 7, totalDays);
  return { startDay, endDay };
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
