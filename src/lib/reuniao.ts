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
