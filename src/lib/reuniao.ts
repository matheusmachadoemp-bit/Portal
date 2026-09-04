export function periodoRange(periodo: string) {
  const [yearStr, monthStr] = periodo.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

export function currentPeriodo() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function periodoLabel(periodo: string) {
  const { start } = periodoRange(periodo);
  return start.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

const MES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function periodoShortLabel(periodo: string) {
  const { start } = periodoRange(periodo);
  return `${MES_ABREV[start.getUTCMonth()]}/${String(start.getUTCFullYear()).slice(2)}`;
}

export const SALAO_PRODUTOS_PADRAO = ["Bebidas", "Pizza Doce", "Suco", "Vinho", "Combos NordFlix"];

export function previousPeriodo(periodo: string) {
  const [yearStr, monthStr] = periodo.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const prev = new Date(Date.UTC(year, month - 2, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Resolve quais até 3 períodos entram no comparativo do PDF/gráfico.
 * Se o usuário escolheu meses manualmente (ex.: Jan/2025 x Jan/2026, ou
 * Jun x Jul x Ago), usa exatamente esses, em ordem cronológica. Sem
 * escolha manual, cai no padrão: o mês selecionado e os 2 anteriores.
 */
export function resolveComparePeriodos(selected: string, custom: (string | null | undefined)[]): string[] {
  const filled = [...new Set(custom.filter((p): p is string => Boolean(p)))].sort();
  if (filled.length > 0) return filled;
  const p1 = previousPeriodo(selected);
  const p2 = previousPeriodo(p1);
  return [p2, p1, selected];
}

export type Comparison = { deltaPercent: number | null; favorable: boolean | null };

/**
 * Compara o valor do mês atual com o do mês passado, no mesmo padrão do
 * relatório de fechamento (ex.: "🟢 +5,58%"). `direction` diz se subir é
 * bom ("max", padrão) ou se descer é bom ("min", ex.: CMV, cancelamento).
 */
export function compareToPrevious(
  current: number | null | undefined,
  previous: number | null | undefined,
  direction: "max" | "min" = "max"
): Comparison | null {
  if (current == null || previous == null) return null;
  const deltaPercent = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : null;
  const favorable = current === previous ? null : direction === "max" ? current > previous : current < previous;
  return { deltaPercent, favorable };
}
