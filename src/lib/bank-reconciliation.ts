import { prisma } from "@/lib/prisma";

const MATCH_WINDOW_DAYS = 5;
const VALOR_TOLERANCE = 0.005;

export type MatchTransaction = {
  id: string;
  direction: "ENTRADA" | "SAIDA";
  valor: number;
  date: Date;
};

export type MatchCandidate = {
  id: string;
  valor: number;
  date: Date;
};

function diffInDays(a: Date, b: Date) {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

// Casa cada transação pendente com o melhor candidato (mesmo valor, data mais próxima
// dentro da janela de tolerância), sem reutilizar um candidato em mais de uma transação.
export function matchTransactions(
  transactions: MatchTransaction[],
  payables: MatchCandidate[],
  receivables: MatchCandidate[]
): Map<string, { type: "PAYABLE" | "RECEIVABLE"; id: string }> {
  const availablePayables = new Set(payables.map((p) => p.id));
  const availableReceivables = new Set(receivables.map((r) => r.id));
  const result = new Map<string, { type: "PAYABLE" | "RECEIVABLE"; id: string }>();

  const sortedTransactions = [...transactions].sort((a, b) => a.date.getTime() - b.date.getTime());

  for (const t of sortedTransactions) {
    const pool = t.direction === "SAIDA" ? payables : receivables;
    const available = t.direction === "SAIDA" ? availablePayables : availableReceivables;

    let best: MatchCandidate | null = null;
    let bestDiff = Infinity;
    for (const candidate of pool) {
      if (!available.has(candidate.id)) continue;
      if (Math.abs(candidate.valor - t.valor) > VALOR_TOLERANCE) continue;
      const diff = diffInDays(candidate.date, t.date);
      if (diff > MATCH_WINDOW_DAYS) continue;
      if (diff < bestDiff || (diff === bestDiff && (!best || candidate.id < best.id))) {
        best = candidate;
        bestDiff = diff;
      }
    }

    if (best) {
      available.delete(best.id);
      result.set(t.id, { type: t.direction === "SAIDA" ? "PAYABLE" : "RECEIVABLE", id: best.id });
    }
  }

  return result;
}

// Resolve os rótulos (ex.: "CP-00003 — Fornecedor Bebidas Ltda") dos vínculos de um
// conjunto de transações, para exibição na tabela de conciliação.
export async function resolveMatchLabels(
  transactions: { matchedType: string | null; matchedId: string | null }[]
): Promise<Map<string, string>> {
  const payableIds = [
    ...new Set(transactions.filter((t) => t.matchedType === "PAYABLE" && t.matchedId).map((t) => t.matchedId as string)),
  ];
  const receivableIds = [
    ...new Set(
      transactions.filter((t) => t.matchedType === "RECEIVABLE" && t.matchedId).map((t) => t.matchedId as string)
    ),
  ];

  const [payables, receivables] = await Promise.all([
    payableIds.length
      ? prisma.payable.findMany({ where: { id: { in: payableIds } }, select: { id: true, number: true, fornecedor: true } })
      : Promise.resolve([]),
    receivableIds.length
      ? prisma.receivable.findMany({ where: { id: { in: receivableIds } }, select: { id: true, number: true, cliente: true } })
      : Promise.resolve([]),
  ]);

  const labels = new Map<string, string>();
  for (const p of payables) labels.set(`PAYABLE:${p.id}`, `${p.number} — ${p.fornecedor}`);
  for (const r of receivables) labels.set(`RECEIVABLE:${r.id}`, `${r.number} — ${r.cliente}`);
  return labels;
}
