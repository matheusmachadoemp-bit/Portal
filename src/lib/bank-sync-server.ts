import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { autoMatchBankTransactions } from "@/lib/bank-reconciliation";
import { spDateKey, spEndOfDay, spStartOfDay } from "@/lib/timezone";
import {
  normalizeIncoming,
  planSync,
  txInstant,
  type ExistingBankTx,
  type NormalizedBankTx,
  type SyncAdoption,
  type SyncMerge,
  type SyncRekey,
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
  /** "Não compensados" que o banco trocou de id ao compensar (a mesma linha ganhou o id novo, sem perder o que já foi feito nela). */
  rekeyed: number;
  /** Duplicatas arquivo × banco resolvidas sozinhas (a linha do arquivo assumiu o id do banco ou a duplicada intocada saiu). */
  merged: number;
  /** Duplicatas arquivo × banco que ficaram porque as duas linhas já foram mexidas (precisam de revisão). */
  duplicatesLeft: number;
  /** "Não compensados" sumidos do banco que não foram apagados porque alguém já mexeu neles (precisam de revisão). */
  staleKept: number;
  /** Linhas de extrato em arquivo dentro do período do banco que não acharam par (podem ser lançamentos que o banco não tem). */
  fileRowsUnpaired: number;
  /** Quantos lançamentos pendentes foram conciliados sozinhos com contas a pagar/receber (null se a conciliação automática falhou). */
  matched: number | null;
  importId: string | null;
};

const CHUNK = 500;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ORPHANS = 20_000;

/** Já existe uma sincronização desta conta em andamento (a ponte deve tentar de novo em instantes). */
export class BankSyncBusyError extends Error {
  constructor() {
    super("Já existe uma sincronização desta conta em andamento.");
    this.name = "BankSyncBusyError";
  }
}
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
  observacoes: true,
  matchedType: true,
  matchedId: true,
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
        ${part.map((r) => r.tx.occurredAt?.toISOString() ?? null)}::text[],
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
 * - O mesmo lançamento visto por duas fontes não duplica: linhas de extrato em ARQUIVO (sem id do
 *   banco) e linhas do banco com o mesmo dia em São Paulo, sentido e valor (ou, se o par for único,
 *   com 1 dia de diferença) são juntadas — a conciliação já feita é preservada. Vale nos dois
 *   sentidos: arquivo importado antes OU depois da conexão.
 * - "Não compensado" que o banco troca de id ao compensar: a mesma linha ganha o id novo.
 * - Tudo numa transação com trava por conta (se já há uma rodando, devolve `BankSyncBusyError`).
 */
export async function syncBankTransactions(params: {
  bankAccount: { id: string; empresaId: string };
  rows: unknown[];
  balance?: number | null;
  /** A ponte garante que mandou TUDO do período: pendentes que sumiram do banco são removidos. */
  windowComplete?: boolean;
  /** Período que a ponte pediu ao banco (instantes). Sem isto, vale a faixa dos próprios lançamentos. */
  window?: { from: Date; to: Date } | null;
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
    rekeyed: 0,
    merged: 0,
    duplicatesLeft: 0,
    staleKept: 0,
    fileRowsUnpaired: 0,
    matched: null,
    importId: null,
  };

  // Lote inteiro inválido (o formato da ponte mudou?): não grava nada — nem "última atualização" nem saldo.
  if (result.received > 0 && valid.length === 0) return result;

  const autoMatchIds: string[] = [];
  const createdExternalIds: string[] = [];

  await prisma.$transaction(
    async (tx) => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtextextended(${`bank-sync:${bankAccount.id}`}, 0)) AS locked
      `;
      if (!locked) throw new BankSyncBusyError();

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
        const known = new Map<string, ExistingBankTx>();
        const addKnown = (rows: unknown[]) => {
          for (const row of rows as ExistingBankTx[]) known.set(row.id, row);
        };
        for (const part of chunks(ids, 1000)) {
          addKnown(
            await tx.bankTransaction.findMany({
              where: { bankAccountId: bankAccount.id, externalId: { in: part } },
              select: EXISTING_SELECT,
            })
          );
        }

        const instants = valid.map((v) => txInstant(v).getTime());
        const minAt = Math.min(...instants);
        const maxAt = Math.max(...instants);
        const windowFrom = params.window ? params.window.from.getTime() : minAt;
        const windowTo = params.window ? params.window.to.getTime() : maxAt;
        const firstDay = spDateKey(new Date(Math.min(minAt, windowFrom)));
        const lastDay = spDateKey(new Date(Math.max(maxAt, windowTo)));

        // "Não compensados" perto da faixa: podem ter sido trocados por outro id ao compensar.
        addKnown(
          await tx.bankTransaction.findMany({
            where: {
              bankAccountId: bankAccount.id,
              pendingAtBank: true,
              externalId: { not: null },
              date: {
                gte: new Date(spStartOfDay(firstDay).getTime() - DAY_MS),
                lte: new Date(spEndOfDay(lastDay).getTime() + DAY_MS),
              },
            },
            select: EXISTING_SELECT,
          })
        );

        // Extratos de arquivo (sem id do banco) dentro do período que o banco cobre — importados antes
        // OU depois da conexão. Em regime normal não há nenhum e esta consulta devolve vazio.
        const [coverageFirst, coverageLast] = await Promise.all([
          tx.bankTransaction.findFirst({
            where: { bankAccountId: bankAccount.id, source: "OPEN_FINANCE", externalId: { not: null } },
            orderBy: { date: "asc" },
            select: { date: true },
          }),
          tx.bankTransaction.findFirst({
            where: { bankAccountId: bankAccount.id, source: "OPEN_FINANCE", externalId: { not: null } },
            orderBy: { date: "desc" },
            select: { date: true },
          }),
        ]);
        const coverageFrom = Math.min(spStartOfDay(firstDay).getTime(), coverageFirst?.date.getTime() ?? Infinity);
        const coverageTo = Math.max(spEndOfDay(lastDay).getTime(), coverageLast ? spEndOfDay(spDateKey(coverageLast.date)).getTime() : -Infinity);
        const orphans = (await tx.bankTransaction.findMany({
          where: {
            bankAccountId: bankAccount.id,
            externalId: null,
            date: { gte: new Date(coverageFrom - DAY_MS), lte: new Date(coverageTo + DAY_MS) },
          },
          orderBy: { date: "asc" },
          take: MAX_ORPHANS,
          select: EXISTING_SELECT,
        })) as ExistingBankTx[];

        if (orphans.length > 0) {
          const orphanTimes = orphans.map((o) => o.date.getTime());
          addKnown(
            await tx.bankTransaction.findMany({
              where: {
                bankAccountId: bankAccount.id,
                source: "OPEN_FINANCE",
                externalId: { not: null },
                date: {
                  gte: new Date(Math.min(...orphanTimes) - DAY_MS),
                  lte: new Date(Math.max(...orphanTimes) + DAY_MS),
                },
              },
              take: MAX_ORPHANS,
              select: EXISTING_SELECT,
            })
          );
        }

        const plan = planSync({
          incoming: valid,
          existing: [...known.values()],
          orphans,
          // Linha inválida no lote: não dá para afirmar o que "sumiu" do banco — nada é removido.
          windowComplete: params.windowComplete === true && invalid === 0,
          window: params.window ?? undefined,
        });

        // Fusões: a linha do banco sai ANTES de a do arquivo assumir o id dela (índice único conta+id).
        const dropIds = [...plan.merges.map((m) => m.deleteRowId), ...plan.orphanRemovals, ...plan.removals];
        if (dropIds.length > 0) {
          for (const part of chunks(dropIds, 1000)) {
            await tx.bankTransaction.deleteMany({ where: { id: { in: part } } });
          }
        }
        result.removed = plan.removals.length;

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
        createdExternalIds.push(...plan.creates.map((c) => c.externalId));

        const bulk: BulkRow[] = [
          ...plan.adoptions.map((a: SyncAdoption) => ({ id: a.orphanId, tx: a.tx, adopt: true, setDescricao: false, resetMatch: false })),
          ...plan.merges.map((m: SyncMerge) => ({ id: m.orphanId, tx: m.tx, adopt: true, setDescricao: false, resetMatch: false })),
          ...plan.rekeys.map((r: SyncRekey) => ({ id: r.rowId, tx: r.tx, adopt: true, setDescricao: r.setDescricao, resetMatch: false })),
          ...plan.updates.map((u: SyncUpdate) => ({ id: u.id, tx: u.tx, adopt: false, setDescricao: u.setDescricao, resetMatch: u.resetMatch })),
        ];
        if (bulk.length > 0) await bulkUpdate(tx, bulk);

        // Candidatos à conciliação automática: só o que é novidade desta rodada.
        autoMatchIds.push(
          ...plan.adoptions.map((a) => a.orphanId),
          ...plan.merges.map((m) => m.orphanId),
          ...plan.rekeys.map((r) => r.rowId),
          ...plan.updates.filter((u) => u.settled).map((u) => u.id)
        );

        result.adopted = plan.adoptions.length;
        result.merged = plan.merges.length + plan.orphanRemovals.length;
        result.rekeyed = plan.rekeys.length;
        result.updated = plan.updates.length;
        result.unchanged = plan.unchanged;
        result.duplicatesLeft = plan.duplicatesLeft;
        result.staleKept = plan.staleKept;
        result.fileRowsUnpaired = Math.max(
          0,
          orphans.length - plan.adoptions.length - plan.merges.length - plan.orphanRemovals.length - plan.duplicatesLeft
        );

        if (createdExternalIds.length > 0) {
          for (const part of chunks(createdExternalIds, 1000)) {
            const rows = await tx.bankTransaction.findMany({
              where: { bankAccountId: bankAccount.id, externalId: { in: part }, status: "PENDENTE", pendingAtBank: false },
              select: { id: true },
            });
            autoMatchIds.push(...rows.map((r) => r.id));
          }
        }
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

  // Conciliação automática com contas a pagar/receber, só dos lançamentos que são novidade desta
  // rodada (quem desfez uma conciliação à mão não a vê voltar). Fora da transação: se falhar, os
  // lançamentos já estão salvos (o botão "Conciliar automaticamente" tenta de novo).
  try {
    result.matched = autoMatchIds.length > 0 ? await autoMatchBankTransactions(bankAccount.empresaId, bankAccount.id, autoMatchIds) : 0;
  } catch (error) {
    console.error("[bank-sync] conciliação automática falhou:", error);
  }

  return result;
}
