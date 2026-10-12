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

const OPEN_STATUSES = ["EM_ABERTO", "PARCIALMENTE_PAGO", "ATRASADO"] as const;

/**
 * Concilia sozinho os lançamentos PENDENTES da empresa (opcionalmente de uma conta) com contas a
 * pagar/receber em aberto (mesmo valor, data mais próxima dentro da janela). Devolve quantos casaram.
 * Lançamentos que o banco ainda não compensou (`pendingAtBank`) ficam de fora: podem mudar de valor/id.
 * Usada pelo botão "Conciliar automaticamente" (tudo que está pendente) e pela sincronização com o
 * banco (só `onlyTransactionIds`: as novidades da rodada — quem desfez uma conciliação à mão não a vê
 * voltar sozinha na rodada seguinte).
 *
 * Roda dentro de uma transação com trava POR EMPRESA: duas execuções ao mesmo tempo (duas contas da
 * mesma loja sincronizando, ou a sincronização + o botão) leriam o mesmo conjunto de contas livres e
 * ligariam a mesma conta a pagar a dois lançamentos. O `NOT EXISTS` do UPDATE é a segunda barreira.
 */
export async function autoMatchBankTransactions(
  empresaId: string,
  bankAccountId?: string,
  onlyTransactionIds?: string[]
): Promise<number> {
  if (onlyTransactionIds && onlyTransactionIds.length === 0) return 0;

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`bank-match:${empresaId}`}, 0))`;

      const pendingTransactions = await tx.bankTransaction.findMany({
        where: {
          empresaId,
          status: "PENDENTE",
          pendingAtBank: false,
          ...(bankAccountId ? { bankAccountId } : {}),
          ...(onlyTransactionIds ? { id: { in: onlyTransactionIds } } : {}),
        },
        select: { id: true, direction: true, valor: true, date: true },
      });
      if (pendingTransactions.length === 0) return 0;

      const payables = await tx.payable.findMany({
        where: { empresaId, status: { in: [...OPEN_STATUSES] } },
        select: { id: true, valor: true, dataPagamento: true, dataVencimento: true },
      });
      const receivables = await tx.receivable.findMany({
        where: { empresaId, status: { in: [...OPEN_STATUSES] } },
        select: { id: true, valor: true, dataRecebimento: true, dataVencimento: true },
      });

      // Payables/receivables já vinculados a outra transação conciliada não entram no pool.
      const alreadyMatched = await tx.bankTransaction.findMany({
        where: { empresaId, status: "CONCILIADO", matchedId: { not: null } },
        select: { matchedType: true, matchedId: true },
      });
      const matchedPayableIds = new Set(alreadyMatched.filter((m) => m.matchedType === "PAYABLE").map((m) => m.matchedId));
      const matchedReceivableIds = new Set(
        alreadyMatched.filter((m) => m.matchedType === "RECEIVABLE").map((m) => m.matchedId)
      );

      const matches = matchTransactions(
        pendingTransactions.map((t) => ({ id: t.id, direction: t.direction, valor: t.valor, date: t.date })),
        payables
          .filter((p) => !matchedPayableIds.has(p.id))
          .map((p) => ({ id: p.id, valor: p.valor, date: p.dataPagamento ?? p.dataVencimento })),
        receivables
          .filter((r) => !matchedReceivableIds.has(r.id))
          .map((r) => ({ id: r.id, valor: r.valor, date: r.dataRecebimento ?? r.dataVencimento }))
      );
      if (matches.size === 0) return 0;

      // Uma única query SQL (`UPDATE ... FROM UNNEST(...)`) em vez de um `update` por linha dentro de
      // uma transação interativa: um extrato (ou uma carga do banco) pode ter centenas de lançamentos
      // batendo de uma vez (mesmo bug já corrigido em `syncEmpresaSaiposSales`, ver `src/lib/saipos-sync.ts`).
      const transactionIds = [...matches.keys()];
      const types = [...matches.values()].map((m) => m.type);
      const ids = [...matches.values()].map((m) => m.id);

      return tx.$executeRaw`
        UPDATE "BankTransaction" AS bt
        SET
          "status" = 'CONCILIADO'::"BankTransactionStatus",
          "matchedType" = v.matched_type,
          "matchedId" = v.matched_id,
          "updatedAt" = now()
        FROM UNNEST(${transactionIds}::text[], ${types}::text[], ${ids}::text[])
          AS v(transaction_id, matched_type, matched_id)
        WHERE bt."id" = v.transaction_id
          AND bt."status" = 'PENDENTE'::"BankTransactionStatus"
          AND NOT EXISTS (
            SELECT 1 FROM "BankTransaction" o
            WHERE o."status" = 'CONCILIADO'::"BankTransactionStatus"
              AND o."matchedType" = v.matched_type
              AND o."matchedId" = v.matched_id
              AND o."id" <> bt."id"
          )
      `;
    },
    { maxWait: 10_000, timeout: 30_000 }
  );
}
