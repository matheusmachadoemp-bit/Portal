export function safeDiv(a: number, b: number): number {
  if (!b) return 0;
  return a / b;
}

export function pct(a: number, b: number): number {
  return safeDiv(a, b) * 100;
}

export function growth(current: number, previous: number): number | null {
  if (!previous) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value || 0
  );
}

export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value || 0);
}

export function formatPercent(value: number, decimals = 1): string {
  return `${formatNumber(value, decimals)}%`;
}

export function classifyKpi(value: number, thresholds: { ruim: number; regular: number; bom: number }) {
  if (value < thresholds.ruim) return { label: "Ruim", tone: "danger" as const };
  if (value < thresholds.regular) return { label: "Regular", tone: "warning" as const };
  if (value < thresholds.bom) return { label: "Bom", tone: "info" as const };
  return { label: "Excelente", tone: "success" as const };
}
