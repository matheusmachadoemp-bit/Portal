import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";

/**
 * Filtro de vencimento para telas que olham pra frente (contas a pagar/receber) — diferente
 * do padrão de período do portal (Hoje/Ontem/Últimos 7 dias/Este mês/Mês passado/
 * Personalizado, em @/lib/periods), que é sempre voltado pro passado (não faz sentido pra
 * uma lista de contas, onde a maioria dos vencimentos ainda não aconteceu). "Atrasadas" é
 * calculado pela data de vencimento já passada e o status ainda não pago/recebido nem
 * cancelado, e não pelo status ATRASADO em si — esse status não é atualizado automaticamente
 * em lugar nenhum, só se alguém escolher manualmente no formulário.
 */
export type DueDateFilterKey = "" | "atrasadas" | "hoje" | "semana" | "mes" | "personalizado";

export const DUE_DATE_FILTER_OPTIONS: { key: DueDateFilterKey; label: string }[] = [
  { key: "", label: "Todos os vencimentos" },
  { key: "atrasadas", label: "Atrasadas" },
  { key: "hoje", label: "Vence hoje" },
  { key: "semana", label: "Esta semana" },
  { key: "mes", label: "Este mês" },
  { key: "personalizado", label: "Personalizado" },
];

export function matchesDueDateFilter(
  dataVencimento: Date,
  status: string,
  key: DueDateFilterKey,
  custom: { from?: string; to?: string },
  settledStatuses: string[],
  now: Date = new Date()
): boolean {
  switch (key) {
    case "":
      return true;
    case "atrasadas":
      return dataVencimento < startOfDay(now) && !settledStatuses.includes(status);
    case "hoje":
      return dataVencimento >= startOfDay(now) && dataVencimento <= endOfDay(now);
    case "semana":
      return dataVencimento >= startOfWeek(now, { weekStartsOn: 1 }) && dataVencimento <= endOfWeek(now, { weekStartsOn: 1 });
    case "mes":
      return dataVencimento >= startOfMonth(now) && dataVencimento <= endOfMonth(now);
    case "personalizado":
      if (!custom.from || !custom.to) return true;
      return dataVencimento >= startOfDay(new Date(custom.from)) && dataVencimento <= endOfDay(new Date(custom.to));
    default:
      return true;
  }
}
