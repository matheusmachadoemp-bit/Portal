import { startOfWeek, endOfWeek, subWeeks, startOfMonth, endOfMonth, subMonths, format } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Filtro por período "fechado" (semana ou mês calendário já encerrado) — usado no CMV Real e
 * CMV Teórico, onde não faz sentido reportar um CMV "final" de uma semana/mês ainda em
 * andamento. Diferente do padrão de período do portal (@/lib/periods, sempre relativo a
 * "hoje"): aqui o usuário escolhe explicitamente QUAL semana/mês já fechado quer ver, entre
 * uma lista dos últimos N.
 */
export type ClosedPeriodMode = "semana" | "mes";

export type ClosedPeriodOption = { key: string; label: string; from: Date; to: Date };

const WEEK_OPTS = { weekStartsOn: 1 as const };

/** Últimas `count` semanas fechadas (segunda a domingo), a mais recente primeiro — nunca inclui a semana atual, ainda em andamento. */
export function listClosedWeeks(count = 12, now: Date = new Date()): ClosedPeriodOption[] {
  const lastClosedWeekStart = startOfWeek(subWeeks(now, 1), WEEK_OPTS);
  return Array.from({ length: count }, (_, i) => {
    const from = subWeeks(lastClosedWeekStart, i);
    const to = endOfWeek(from, WEEK_OPTS);
    return { key: format(from, "yyyy-MM-dd"), label: `${format(from, "dd/MM")} a ${format(to, "dd/MM")}`, from, to };
  });
}

/** Últimos `count` meses fechados (mês calendário inteiro), o mais recente primeiro — nunca inclui o mês atual, ainda em andamento. */
export function listClosedMonths(count = 12, now: Date = new Date()): ClosedPeriodOption[] {
  const lastClosedMonthStart = startOfMonth(subMonths(now, 1));
  return Array.from({ length: count }, (_, i) => {
    const from = subMonths(lastClosedMonthStart, i);
    const to = endOfMonth(from);
    return { key: format(from, "yyyy-MM"), label: capitalize(format(from, "MMMM/yyyy", { locale: ptBR })), from, to };
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Resolve {from, to} a partir do modo + chave escolhidos, com fallback pro período fechado mais recente se a chave não bater com nenhuma opção. */
export function resolveClosedPeriod(mode: ClosedPeriodMode, key: string | undefined, now: Date = new Date()): ClosedPeriodOption {
  const options = mode === "semana" ? listClosedWeeks(12, now) : listClosedMonths(12, now);
  return options.find((o) => o.key === key) ?? options[0];
}
