import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { autoMatchBankTransactions } from "@/lib/bank-reconciliation";
import { spDateKey, spEndOfDay, spStartOfDay } from "@/lib/timezone";
import {
  normalizeIncoming,
  planSync,
  type ExistingBankTx,
  type NormalizedBankTx,
  type SyncAdoption,
  type SyncUpdate,
} from "@/lib/bank-sync";

export const OPEN_FINANCE_IMPORT_NAME = "Conexão com o banco (Open Finance)";

export type BankSyncResult = {
  received: number;
  valid: number;
  invalid: number;
  invalidSamples: string[];
  created: number;
  adopted: number;
  updated: number;
  unchanged: number;
  removed: number;
  /** Quantos lançamentos pendentes foram conciliados sozinhos com contas a pagar/receber (null se a conciliação automática falhou). */
  matched: number | null;
  importId: string | null;
};

const CHUNK = 500;
const EXISTING_SELECT = {
  id: true,
  externalId: true,
  source: true,
  status: true,
  direction: true,
  valor: true,
  date: true,
  occurredAt: true,
  descricao: true,
  counterpart: true,
  bankCategory: true,
  paymentMethod: true,
  pendingAtBank: true,
  createdAt: true,
} as const;

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

type BulkRow = {
  id: string;
  tx: NormalizedBankTx;
  /** Lançamento de arquivo que ganhou o id do banco (a origem `source` continua "ARQUIVO": a descrição dele não é reescrita). */
  adopt: boolean;
  setDescricao: boolean;
  resetMatch: boolean;
};

/**
 * Atualiza vários lançamentos numa única consulta (`UPDATE ... FROM UNNEST(...)`), no lugar de um
 * `update` por linha: com o banco remoto (Neon), milhares de idas e voltas estourariam o tempo da
 * transação (mesmo cuidado de `auto-match` e de `syncEmpresaSaiposSales`). Datas viajam como texto
 * ISO e viram `timestamp` sem fuso (UTC), igual ao que o Prisma grava nas colunas `TIMESTAMP(3)`.
 */
async function bulkUpdate(tx: Prisma.TransactionClient, rows: BulkRow[]) {
  for (const part of chunks(rows, 1000)) {
    await tx.$executeRaw`
      UPDATE "BankTransaction" AS bt
      SET
        "externalId" = CASE WHEN v.adopt THEN v.external_id ELSE bt."externalId" END,
        "valor" = v.valor,
        "direction" = v.direction::"BankTransactionDirection",
        "date" = v.date::timestamp,
        "occurredAt" = v.occurred_at::timestamp,
        "descricao" = CASE WHEN v.set_desc THEN v.descricao ELSE bt."descricao" END,
        "counterpart" = v.counterpart,
        "bankCategory" = v.bank_category,
        "paymentMethod" = v.payment_method,
        "pendingAtBank" = v.pending,
        "status" = CASE WHEN v.reset THEN 'PENDENTE'::"BankTransactionStatus" ELSE bt."status" END,
        "matchedType" = CASE WHEN v.reset THEN NULL ELSE bt."matchedType" END,
        "matchedId" = CASE WHEN v.reset THEN NULL ELSE bt."matchedId" END,
        "updatedAt" = now()
      FROM UNNEST(
        ${part.map((r) => r.id)}::text[],
        ${part.map((r) => r.tx.externalId)}::text[],
        ${part.map((r) => r.tx.valor)}::double precision[],
        ${part.map((r) => r.tx.direction)}::text[],
        ${part.map((r) => r.tx.date.toISOString())}::text[],
        ${part.map((r) => r.tx.occurredAt.toISOString())}::text[],
        ${part.map((r) => r.tx.descricao)}::text[],
        ${part.map((r) => r.tx.counterpart)}::text[],
        ${part.map((r) => r.tx.bankCategory)}::text[],
        ${part.map((r) => r.tx.paymentMethod)}::text[],
        ${part.map((r) => r.tx.pendingAtBank)}::boolean[],
        ${part.map((r) => r.adopt)}::boolean[],
        ${part.map((r) => r.setDescricao)}::boolean[],
        ${part.map((r) => r.resetMatch)}::boolean[]
      ) AS v(id, external_id, valor, direction, date, occurred_at, descricao, counterpart, bank_category, payment_method, pending, adopt, set_desc, reset)
      WHERE bt."id" = v.id
    `;
  }
}

/**
 * Recebe os lançamentos que a "ponte" buscou no banco e grava na conta bancária do portal.
 *
 * - Idempotente: o id do banco (`externalId`) + o índice único (conta, externalId) impedem repetir;
 *   mandar o mesmo lote de novo não muda nada.
 * - Lançamentos que já tinham sido importados por ARQUIVO (sem id do banco) e que o banco confirma
 *   (mesmo dia em São Paulo, mesmo sentido e mesmo valor) são "adotados": ganham o id do banco e
 *   mantêm a conciliação já feita, em vez de duplicar.
 * - Tudo numa transação com trava por conta (duas ponte rodando juntas não se atropelam).
 */
export async function syncBankTransactions(params: {
  bankAccount: { id: string; empresaId: string };
  rows: unknown[];
  balance?: number | null;
  /** A ponte garante que mandou TUDO do período: pendentes que sumiram do banco são removidos. */
  windowComplete?: boolean;
  now?: Date;
}): Promise<BankSyncResult> {
  const now = params.now ?? new Date();
  const { bankAccount } = params;

  const valid: NormalizedBankTx[] = [];
  const invalidSamples: string[] = [];
  let invalid = 0;
  for (const raw of params.rows) {
    const n = normalizeIncoming(raw, now);
    if (n.ok) valid.push(n.tx);
    else {
      invalid++;
      if (invalidSamples.length < 10) invalidSamples.push(n.error);
    }
  }

  const result: BankSyncResult = {
    received: params.rows.length,
    valid: valid.length,
    invalid,
    invalidSamples,
    created: 0,
    adopted: 0,
    updated: 0,
    unchanged: 0,
    removed: 0,
    matched: null,
    importId: null,
  };

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`bank-sync:${bankAccount.id}`}, 0))`;

      // Registro contínuo "da conexão com o banco" desta conta (os lançamentos precisam de um import).
      let importRow = await tx.bankReconciliationImport.findFirst({
        where: { bankAccountId: bankAccount.id, source: "OPEN_FINANCE" },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (!importRow) {
        importRow = await tx.bankReconciliationImport.create({
          data: {
            empresaId: bankAccount.empresaId,
            bankAccountId: bankAccount.id,
            fileName: OPEN_FINANCE_IMPORT_NAME,
            source: "OPEN_FINANCE",
          },
          select: { id: true },
        });
      }
      result.importId = importRow.id;

      if (valid.length > 0) {
        const ids = [...new Set(valid.map((v) => v.externalId))];
        const existing: ExistingBankTx[] = [];
        for (const part of chunks(ids, 1000)) {
          const found = await tx.bankTransaction.findMany({
            where: { bankAccountId: bankAccount.id, externalId: { in: part } },
            select: EXISTING_SELECT,
          });
          existing.push(...(found as ExistingBankTx[]));
        }

        const minOccurred = new Date(Math.min(...valid.map((v) => v.occurredAt.getTime())));
        const maxOccurred = new Date(Math.max(...valid.map((v) => v.occurredAt.getTime())));

        // Extratos de arquivo no mesmo período (ainda sem id do banco): candidatos a "adoção".
        const orphans = (await tx.bankTransaction.findMany({
          where: {
            bankAccountId: bankAccount.id,
            externalId: null,
            date: { gte: spStartOfDay(spDateKey(minOccurred)), lte: spEndOfDay(spDateKey(maxOccurred)) },
          },
          select: EXISTING_SELECT,
        })) as ExistingBankTx[];

        const windowPending = params.windowComplete
          ? await tx.bankTransaction.findMany({
              where: {
                bankAccountId: bankAccount.id,
                pendingAtBank: true,
                externalId: { not: null },
                occurredAt: { gte: minOccurred, lte: maxOccurred },
              },
              select: { id: true, externalId: true, status: true },
            })
          : [];

        const plan = planSync({
          incoming: valid,
          existing,
          orphans,
          windowPending,
          windowComplete: params.windowComplete,
        });

        for (const part of chunks(plan.creates, CHUNK)) {
          const created = await tx.bankTransaction.createMany({
            data: part.map((t) => ({
              empresaId: bankAccount.empresaId,
              bankAccountId: bankAccount.id,
              importId: importRow!.id,
              date: t.date,
              descricao: t.descricao,
              direction: t.direction,
              valor: t.valor,
              externalId: t.externalId,
              source: "OPEN_FINANCE",
              occurredAt: t.occurredAt,
              counterpart: t.counterpart,
              bankCategory: t.bankCategory,
              paymentMethod: t.paymentMethod,
              pendingAtBank: t.pendingAtBank,
            })),
            skipDuplicates: true,
          });
          result.created += created.count;
        }

        const bulk: BulkRow[] = [
          ...plan.adoptions.map((a: SyncAdoption) => ({
            id: a.orphanId,
            tx: a.tx,
            adopt: true,
            setDescricao: false,
            resetMatch: false,
          })),
          ...plan.updates.map((u: SyncUpdate) => ({
            id: u.id,
            tx: u.tx,
            adopt: false,
            setDescricao: u.setDescricao,
            resetMatch: u.resetMatch,
          })),
        ];
        if (bulk.length > 0) await bulkUpdate(tx, bulk);

        if (plan.removals.length > 0) {
          const removed = await tx.bankTransaction.deleteMany({ where: { id: { in: plan.removals } } });
          result.removed = removed.count;
        }

        result.adopted = plan.adoptions.length;
        result.updated = plan.updates.length;
        result.unchanged = plan.unchanged;
      }

      // Totais do registro contínuo (soma de tudo que veio do banco).
      const totals = await tx.bankTransaction.groupBy({
        by: ["direction"],
        where: { importId: importRow.id },
        _sum: { valor: true },
        _count: { _all: true },
      });
      const entradas = totals.find((t) => t.direction === "ENTRADA");
      const saidas = totals.find((t) => t.direction === "SAIDA");
      await tx.bankReconciliationImport.update({
        where: { id: importRow.id },
        data: {
          totalEntradas: entradas?._sum.valor ?? 0,
          totalSaidas: saidas?._sum.valor ?? 0,
          totalLinhas: (entradas?._count._all ?? 0) + (saidas?._count._all ?? 0),
        },
      });

      // Mesmo um lote vazio prova que a conexão está viva: é o que "última atualização" mostra.
      const balance = typeof params.balance === "number" && Number.isFinite(params.balance) ? params.balance : null;
      await tx.bankAccount.update({
        where: { id: bankAccount.id },
        data: {
          lastSyncAt: now,
          ...(balance !== null ? { bankBalance: balance, bankBalanceAt: now } : {}),
        },
      });
    },
    { maxWait: 10_000, timeout: 60_000 }
  );

  // Conciliação automática com contas a pagar/receber. Fora da transação: se falhar, os lançamentos
  // já estão salvos (a próxima atualização ou o botão "Conciliar automaticamente" tenta de novo).
  try {
    result.matched = await autoMatchBankTransactions(bankAccount.empresaId, bankAccount.id);
  } catch (error) {
    console.error("[bank-sync] conciliação automática falhou:", error);
  }

  return result;
}
