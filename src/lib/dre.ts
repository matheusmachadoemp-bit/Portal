import { prisma } from "@/lib/prisma";
import { DRE_STRUCTURE } from "@/lib/dre-structure";
import { getFinancialCategories } from "@/lib/financial-categories";
import { splitPayableByCategory } from "@/lib/compra-itens";

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

export type DrePayableRow = {
  valor: number;
  categoriaId: string;
  // Itens (quando o boleto tem "O que foi comprado" categorizado por item): ver
  // `splitPayableByCategory`, usado para o boleto não cair inteiro numa categoria só quando ele
  // mistura produtos de categorias diferentes (contas a pagar multicategoria).
  invoice?: { items: { categoriaId: string | null; total: number }[] } | null;
};

export type DreReceivableRow = {
  valor: number;
  categoriaId: string;
};

export const DRE_PAYABLE_SELECT = {
  valor: true,
  categoriaId: true,
  invoice: { select: { items: { select: { categoriaId: true, total: true } } } },
} as const;

export const DRE_RECEIVABLE_SELECT = {
  valor: true,
  categoriaId: true,
} as const;

/**
 * Cálculo puro da DRE (sem acesso a banco) a partir de lançamentos já buscados. Permite que quem já
 * tenha os `Payable`/`Receivable` em memória (ex.: Dashboard Financeiro, que busca uma janela maior
 * e filtra por sub-período) monte a DRE sem repetir a busca no banco — ver `computeDre` abaixo, que é
 * só essa busca + esta função, para quem precisa da DRE de um único mês isolado.
 */
export function computeDreFromRows({
  payables,
  receivables,
  dreKeyByCategoriaId,
}: {
  payables: DrePayableRow[];
  receivables: DreReceivableRow[];
  dreKeyByCategoriaId: Map<string, string>;
}): DreComputedRow[] {
  // valor absoluto lançado por categoria (chave = dreKey da categoria)
  const byDreKey = new Map<string, number>();
  const addValue = (dreKey: string, valor: number) => {
    byDreKey.set(dreKey, (byDreKey.get(dreKey) ?? 0) + valor);
  };
  for (const p of payables) {
    const splits = splitPayableByCategory(p.valor, p.categoriaId, p.invoice?.items ?? []);
    for (const s of splits) {
      const dreKey = dreKeyByCategoriaId.get(s.categoriaId);
      if (dreKey) addValue(dreKey, s.valor);
    }
  }
  for (const r of receivables) {
    const dreKey = dreKeyByCategoriaId.get(r.categoriaId);
    if (dreKey) addValue(dreKey, r.valor);
  }

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

  const [payables, receivables, categorias] = await Promise.all([
    prisma.payable.findMany({
      where: {
        status: { in: ["PAGO", "PARCIALMENTE_PAGO"] },
        dataCompetencia: { gte: start, lte: end },
        ...empresaFilter,
      },
      select: DRE_PAYABLE_SELECT,
    }),
    prisma.receivable.findMany({
      where: {
        status: { in: ["PAGO", "PARCIALMENTE_PAGO"] },
        dataCompetencia: { gte: start, lte: end },
        ...empresaFilter,
      },
      select: DRE_RECEIVABLE_SELECT,
    }),
    getFinancialCategories(),
  ]);

  const dreKeyByCategoriaId = new Map(categorias.map((c) => [c.id, c.dreKey]));

  return computeDreFromRows({ payables, receivables, dreKeyByCategoriaId });
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
