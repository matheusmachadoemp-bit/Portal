import {
  startOfDay,
  endOfDay,
  subDays,
  startOfWeek,
  endOfWeek,
  subWeeks,
  startOfMonth,
  endOfMonth,
  subMonths,
} from "date-fns";

export type PeriodKey =
  | "hoje"
  | "ontem"
  | "semana"
  | "semana-anterior"
  | "mes"
  | "mes-anterior"
  | "personalizado";

export function resolvePeriod(
  key: PeriodKey,
  custom?: { from?: string; to?: string }
): { from: Date; to: Date; prevFrom: Date; prevTo: Date } {
  const now = new Date();
  switch (key) {
    case "hoje":
      return {
        from: startOfDay(now),
        to: endOfDay(now),
        prevFrom: startOfDay(subDays(now, 1)),
        prevTo: endOfDay(subDays(now, 1)),
      };
    case "ontem":
      return {
        from: startOfDay(subDays(now, 1)),
        to: endOfDay(subDays(now, 1)),
        prevFrom: startOfDay(subDays(now, 2)),
        prevTo: endOfDay(subDays(now, 2)),
      };
    case "semana":
      return {
        from: startOfWeek(now, { weekStartsOn: 1 }),
        to: endOfWeek(now, { weekStartsOn: 1 }),
        prevFrom: startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }),
        prevTo: endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }),
      };
    case "semana-anterior":
      return {
        from: startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }),
        to: endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }),
        prevFrom: startOfWeek(subWeeks(now, 2), { weekStartsOn: 1 }),
        prevTo: endOfWeek(subWeeks(now, 2), { weekStartsOn: 1 }),
      };
    case "mes-anterior":
      return {
        from: startOfMonth(subMonths(now, 1)),
        to: endOfMonth(subMonths(now, 1)),
        prevFrom: startOfMonth(subMonths(now, 2)),
        prevTo: endOfMonth(subMonths(now, 2)),
      };
    case "personalizado":
      if (custom?.from && custom?.to) {
        const from = startOfDay(new Date(custom.from));
        const to = endOfDay(new Date(custom.to));
        const diff = to.getTime() - from.getTime();
        return {
          from,
          to,
          prevFrom: new Date(from.getTime() - diff),
          prevTo: new Date(from.getTime() - 1),
        };
      }
    // eslint-disable-next-line no-fallthrough
    case "mes":
    default:
      return {
        from: startOfMonth(now),
        to: endOfMonth(now),
        prevFrom: startOfMonth(subMonths(now, 1)),
        prevTo: endOfMonth(subMonths(now, 1)),
      };
  }
}

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "semana", label: "Esta semana" },
  { key: "semana-anterior", label: "Semana anterior" },
  { key: "mes", label: "Este mês" },
  { key: "mes-anterior", label: "Mês anterior" },
  { key: "personalizado", label: "Personalizado" },
];

// Filtro de período "rolling" (últimos N dias), usado nos mini-filtros de
// cada card (Vendas por Hora, Forma de Pagamento, Área de Entrega).
export type RollingPeriodKey = "hoje" | "ontem" | "7dias" | "30dias" | "personalizado";

export function resolveRollingPeriod(key: RollingPeriodKey, custom?: { from?: string; to?: string }): { from: Date; to: Date } {
  const now = new Date();
  switch (key) {
    case "hoje":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "ontem":
      return { from: startOfDay(subDays(now, 1)), to: endOfDay(subDays(now, 1)) };
    case "7dias":
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case "personalizado":
      if (custom?.from && custom?.to) {
        return { from: startOfDay(new Date(custom.from)), to: endOfDay(new Date(custom.to)) };
      }
      case "30dias":
    default:
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
  }
}

export const ROLLING_PERIOD_OPTIONS: { key: RollingPeriodKey; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "7dias", label: "7 dias" },
  { key: "30dias", label: "30 dias" },
  { key: "personalizado", label: "Personalizado" },
];

/** Alinha a comparação por dia da semana: desloca em múltiplos de 7 dias em vez do diff exato. */
export function resolveSameWeekdayComparison(from: Date, to: Date): { prevFrom: Date; prevTo: Date } {
  const diffDays = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const weeks = Math.max(1, Math.round(diffDays / 7));
  const offsetDays = weeks * 7;
  return {
    prevFrom: new Date(from.getTime() - offsetDays * 24 * 60 * 60 * 1000),
    prevTo: new Date(to.getTime() - offsetDays * 24 * 60 * 60 * 1000),
  };
}
