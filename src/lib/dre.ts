import { prisma } from "@/lib/prisma";
import { DRE_STRUCTURE, type DreRowDef } from "@/lib/dre-structure";

export type DreComputedRow = {
  key: string;
  label: string;
  type: "group" | "result";
  sign?: 1 | -1;
  value: number;
  percent: number; // % sobre o faturamento total
  highlight?: boolean;
  categories?: { key: string; name: string; value: number }[];
};

export async function computeDre({
  month,
  year,
  empresaIds,
}: {
  month: number; // 1-12
  year: number;
  empresaIds: string[];
}): Promise<DreComputedRow[]> {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);

  const empresaFilter = { empresaId: { in: empresaIds } };

  const [payables, receivables] = await Promise.all([
    prisma.payable.findMany({
      where: {
        status: { in: ["PAGO", "PARCIALMENTE_PAGO"] },
        dataCompetencia: { gte: start, lte: end },
        ...empresaFilter,
      },
      select: { valor: true, categoria: { select: { dreKey: true } } },
    }),
    prisma.receivable.findMany({
      where: {
        status: { in: ["PAGO", "PARCIALMENTE_PAGO"] },
        dataCompetencia: { gte: start, lte: end },
        ...empresaFilter,
      },
      select: { valor: true, categoria: { select: { dreKey: true } } },
    }),
  ]);

  // valor absoluto lançado por categoria (chave = dreKey da categoria)
  const byDreKey = new Map<string, number>();
  const addValue = (dreKey: string, valor: number) => {
    byDreKey.set(dreKey, (byDreKey.get(dreKey) ?? 0) + valor);
  };
  for (const p of payables) addValue(p.categoria.dreKey, p.valor);
  for (const r of receivables) addValue(r.categoria.dreKey, r.valor);

  const rows: DreComputedRow[] = [];
  const groupTotals = new Map<string, number>();

  for (const row of DRE_STRUCTURE) {
    if (row.type === "group") {
      const categories = row.categories.map((c) => ({
        key: c.key,
        name: c.name,
        value: byDreKey.get(c.key) ?? 0,
      }));
      const total = categories.reduce((acc, c) => acc + c.value, 0);
      groupTotals.set(row.key, total * row.sign);
      rows.push({
        key: row.key,
        label: row.label,
        type: "group",
        sign: row.sign,
        value: total,
        percent: 0,
        categories,
      });
    } else {
      const value = computeResultValue(row.key, groupTotals);
      groupTotals.set(row.key, value);
      rows.push({ key: row.key, label: row.label, type: "result", value, percent: 0, highlight: row.highlight });
    }
  }

  const faturamentoTotal = groupTotals.get("faturamentos") ?? 0;
  for (const row of rows) {
    row.percent = faturamentoTotal ? (row.value / faturamentoTotal) * 100 : 0;
  }

  return rows;
}

function sum(groupTotals: Map<string, number>, keys: string[]) {
  return keys.reduce((acc, k) => acc + (groupTotals.get(k) ?? 0), 0);
}

function computeResultValue(key: string, groupTotals: Map<string, number>): number {
  switch (key) {
    case "margem-contribuicao":
      return sum(groupTotals, ["faturamentos", "impostos", "custos-vendas", "cmv", "embalagens"]);
    case "gastos-fixos":
      return sum(groupTotals, [
        "despesas-administrativas",
        "despesas-pessoas",
        "marketing",
        "despesas-financeiras",
      ]);
    case "lucro-operacional":
      return (groupTotals.get("margem-contribuicao") ?? 0) + (groupTotals.get("gastos-fixos") ?? 0);
    case "despesas-nao-operacionais":
      return sum(groupTotals, ["emprestimos-despesa", "investimentos", "diversos"]);
    case "lucro-liquido":
      return (
        (groupTotals.get("lucro-operacional") ?? 0) +
        (groupTotals.get("receitas-nao-operacionais") ?? 0) +
        (groupTotals.get("despesas-nao-operacionais") ?? 0)
      );
    case "resultado-final":
      return (groupTotals.get("lucro-liquido") ?? 0) + (groupTotals.get("divisao-lucros") ?? 0);
    default:
      return 0;
  }
}

export function dreRowLabel(row: DreRowDef) {
  return row.label;
}
