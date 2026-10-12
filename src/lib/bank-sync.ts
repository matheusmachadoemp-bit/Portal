/**
 * Regras PURAS (sem banco) da sincronização de lançamentos vindos da conexão com o banco
 * (Open Finance): validar/normalizar cada lançamento e decidir o que criar, atualizar, "adotar" ou
 * remover. A gravação (transação, trava, SQL) fica em `bank-sync-server.ts`.
 */
import { spDateKey, spStartOfDay } from "@/lib/timezone";

export type BankDirection = "ENTRADA" | "SAIDA";

/** Um lançamento como a "ponte" entrega (formato do provedor, já com poucos campos). */
export type IncomingBankTx = {
  id?: unknown;
  date?: unknown;
  description?: unknown;
  amount?: unknown;
  type?: unknown;
  status?: unknown;
  category?: unknown;
  operationType?: unknown;
  counterpart?: unknown;
};

export type NormalizedBankTx = {
  externalId: string;
  /** Instante exato informado pelo banco. */
  occurredAt: Date;
  /** Dia em São Paulo ("YYYY-MM-DD") — é o que a tela mostra e filtra. */
  dateKey: string;
  /** Meia-noite de São Paulo daquele dia (mesma âncora dos extratos importados por arquivo). */
  date: Date;
  direction: BankDirection;
  valor: number;
  descricao: string;
  counterpart: string | null;
  bankCategory: string | null;
  paymentMethod: string | null;
  pendingAtBank: boolean;
};

export const MAX_DESCRIPTION = 300;
const MAX_SHORT = 200;
const MAX_ABS_VALUE = 1_000_000_000;
const MIN_DATE = Date.UTC(2000, 0, 1);
const MAX_FUTURE_MS = 7 * 24 * 60 * 60 * 1000;

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[​-‍⁠﻿]/g, "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

export function toCents(valor: number): number {
  return Math.round(valor * 100);
}

/** Valida e converte um lançamento do banco. Nunca lança: devolve o motivo em português. */
export function normalizeIncoming(
  raw: unknown,
  now: Date = new Date()
): { ok: true; tx: NormalizedBankTx } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "lançamento inválido" };
  const r = raw as IncomingBankTx;

  const externalId = typeof r.id === "string" ? r.id.trim() : "";
  if (!externalId || externalId.length > 200) return { ok: false, error: "sem identificador (id)" };

  if (typeof r.date !== "string" && !(r.date instanceof Date)) return { ok: false, error: `${externalId}: sem data` };
  const occurredAt = new Date(r.date as string | Date);
  if (Number.isNaN(occurredAt.getTime())) return { ok: false, error: `${externalId}: data inválida` };
  if (occurredAt.getTime() < MIN_DATE || occurredAt.getTime() > now.getTime() + MAX_FUTURE_MS) {
    return { ok: false, error: `${externalId}: data fora do intervalo aceito` };
  }

  const amount = typeof r.amount === "number" ? r.amount : typeof r.amount === "string" ? Number(r.amount.replace(",", ".")) : NaN;
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > MAX_ABS_VALUE) {
    return { ok: false, error: `${externalId}: valor inválido` };
  }
  const valor = toCents(Math.abs(amount)) / 100;
  if (valor <= 0) return { ok: false, error: `${externalId}: valor inválido` };

  const type = typeof r.type === "string" ? r.type.trim().toUpperCase() : "";
  const direction: BankDirection | null = type === "CREDIT" ? "ENTRADA" : type === "DEBIT" ? "SAIDA" : null;
  if (!direction) return { ok: false, error: `${externalId}: tipo deve ser CREDIT ou DEBIT` };

  const status = typeof r.status === "string" ? r.status.trim().toUpperCase() : "POSTED";
  const paymentMethod = cleanText(r.operationType, 40);
  const bankCategory = cleanText(r.category, MAX_SHORT);
  const counterpart = cleanText(r.counterpart, MAX_SHORT);
  const descricao = cleanText(r.description, MAX_DESCRIPTION) ?? paymentMethod ?? bankCategory ?? "Lançamento sem descrição";

  const dateKey = spDateKey(occurredAt);
  return {
    ok: true,
    tx: {
      externalId,
      occurredAt,
      dateKey,
      date: spStartOfDay(dateKey),
      direction,
      valor,
      descricao,
      counterpart,
      bankCategory,
      paymentMethod,
      pendingAtBank: status === "PENDING",
    },
  };
}

/** O que o banco já tem gravado de um lançamento da conta (para comparar com o que chegou). */
export type ExistingBankTx = {
  id: string;
  externalId: string | null;
  source: string;
  status: "PENDENTE" | "CONCILIADO" | "IGNORADO" | string;
  direction: BankDirection;
  valor: number;
  date: Date;
  occurredAt: Date | null;
  descricao: string;
  counterpart: string | null;
  bankCategory: string | null;
  paymentMethod: string | null;
  pendingAtBank: boolean;
  createdAt: Date;
};

export type SyncUpdate = {
  id: string;
  /** Valores novos vindos do banco (gravados por inteiro; a descrição só se `setDescricao`). */
  tx: NormalizedBankTx;
  setDescricao: boolean;
  /** Se valor/sentido mudou num lançamento já conciliado, o vínculo deixa de valer. */
  resetMatch: boolean;
};

export type SyncAdoption = { orphanId: string; tx: NormalizedBankTx };

export type SyncPlan = {
  creates: NormalizedBankTx[];
  /** Lançamentos de arquivo (sem externalId) que o banco confirmou: ganham o id do banco sem perder a conciliação. */
  adoptions: SyncAdoption[];
  updates: SyncUpdate[];
  /** Pendentes no banco que sumiram da janela completa entregue (o banco trocou o lançamento). */
  removals: string[];
  unchanged: number;
};

function orphanKey(dateKey: string, direction: BankDirection, valor: number): string {
  return `${dateKey}|${direction}|${toCents(valor)}`;
}

function sameInstant(a: Date | null, b: Date): boolean {
  return a !== null && a.getTime() === b.getTime();
}

/**
 * Decide o que fazer com o lote recebido.
 *  - `existing`: lançamentos da conta que já têm externalId e aparecem no lote.
 *  - `orphans`: lançamentos da conta SEM externalId (extratos de arquivo) na faixa de datas do lote.
 *  - `windowPending`: pendentes do banco (externalId + pendingAtBank) dentro da faixa do lote, usados
 *    só quando `windowComplete` (a ponte garante que mandou TUDO daquele período).
 */
export function planSync(input: {
  incoming: NormalizedBankTx[];
  existing: ExistingBankTx[];
  orphans: ExistingBankTx[];
  windowPending?: { id: string; externalId: string | null; status: string }[];
  windowComplete?: boolean;
}): SyncPlan {
  // Mesmo id repetido no lote: vale o último.
  const byId = new Map<string, NormalizedBankTx>();
  for (const tx of input.incoming) byId.set(tx.externalId, tx);
  const incoming = [...byId.values()].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  const existingByExternal = new Map<string, ExistingBankTx>();
  for (const e of input.existing) if (e.externalId) existingByExternal.set(e.externalId, e);

  const orphanBuckets = new Map<string, ExistingBankTx[]>();
  const sortedOrphans = [...input.orphans]
    .filter((o) => !o.externalId)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  for (const o of sortedOrphans) {
    const key = orphanKey(spDateKey(o.date), o.direction, o.valor);
    const list = orphanBuckets.get(key);
    if (list) list.push(o);
    else orphanBuckets.set(key, [o]);
  }

  const plan: SyncPlan = { creates: [], adoptions: [], updates: [], removals: [], unchanged: 0 };

  for (const tx of incoming) {
    const current = existingByExternal.get(tx.externalId);
    if (current) {
      const valueChanged = toCents(current.valor) !== toCents(tx.valor) || current.direction !== tx.direction;
      // A descrição de um lançamento que veio de arquivo (adotado) fica como estava.
      const setDescricao = current.source === "OPEN_FINANCE" && current.descricao !== tx.descricao;
      const changed =
        valueChanged ||
        setDescricao ||
        current.date.getTime() !== tx.date.getTime() ||
        !sameInstant(current.occurredAt, tx.occurredAt) ||
        current.pendingAtBank !== tx.pendingAtBank ||
        (current.counterpart ?? null) !== tx.counterpart ||
        (current.bankCategory ?? null) !== tx.bankCategory ||
        (current.paymentMethod ?? null) !== tx.paymentMethod;
      if (!changed) plan.unchanged++;
      else plan.updates.push({ id: current.id, tx, setDescricao, resetMatch: valueChanged && current.status === "CONCILIADO" });
      continue;
    }

    const bucket = orphanBuckets.get(orphanKey(tx.dateKey, tx.direction, tx.valor));
    const orphan = bucket?.shift();
    if (orphan) {
      plan.adoptions.push({ orphanId: orphan.id, tx });
      continue;
    }
    plan.creates.push(tx);
  }

  if (input.windowComplete && input.windowPending) {
    const incomingIds = new Set(incoming.map((t) => t.externalId));
    for (const p of input.windowPending) {
      if (p.externalId && p.status === "PENDENTE" && !incomingIds.has(p.externalId)) plan.removals.push(p.id);
    }
  }

  return plan;
}
