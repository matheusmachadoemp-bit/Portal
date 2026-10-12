import { spDateKey } from "@/lib/timezone";

export type PeriodPreset = "all" | "thisMonth" | "lastMonth" | "last30" | "custom";

/** Início e fim ("YYYY-MM-DD", dias de São Paulo) de cada atalho de período; "" = sem limite. */
export function presetRange(preset: PeriodPreset, today: string = spDateKey()): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate(); // mm 1-12 → último dia do mês mm
  if (preset === "thisMonth") return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDay(y, m))}` };
  if (preset === "lastMonth") {
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(lastDay(py, pm))}` };
  }
  if (preset === "last30") {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 29);
    return { from: d.toISOString().slice(0, 10), to: today };
  }
  return { from: "", to: "" };
}
