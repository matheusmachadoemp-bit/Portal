/**
 * Regras PURAS (sem banco) da sincronização de lançamentos vindos da conexão com o banco
 * (Open Finance): validar/normalizar cada lançamento e decidir o que criar, atualizar, "adotar",
 * fundir ou remover. A gravação (transação, trava, SQL) fica em `bank-sync-server.ts`.
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
  /** Instante exato informado pelo banco (null quando o banco só informa o dia, sem hora). */
  occurredAt: Date | null;
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
const DAY_MS = 24 * 60 * 60 * 1000;

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  // Caracteres de controle (inclusive NUL, que o Postgres não aceita em texto) viram espaço.
  const text = value
    .replace(/[​-‍⁠﻿]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, max) : null;
}

export function toCents(valor: number): number {
  return Math.round(valor * 100);
}

/** Quando o banco só informa o dia ("2026-10-12" ou "2026-10-12T00:00:00Z"), não existe hora de verdade. */
const DATE_ONLY = /^(\d{4}-\d{2}-\d{2})(?:[T ]00:00(?::00(?:\.0+)?)?(?:Z|[+-]00:?00)?)?$/;

/** Instante de um lançamento para ordenar e comparar (cai no dia quando o banco não informou a hora). */
export function txInstant(tx: { occurredAt: Date | null; date: Date }): Date {
  return tx.occurredAt ?? tx.date;
}

/** Valida e converte um lançamento do banco. Nunca lança: devolve o motivo em português. */
export function normalizeIncoming(
  raw: unknown,
  now: Date = new Date()
): { ok: true; tx: NormalizedBankTx } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "lançamento inválido" };
  const r = raw as IncomingBankTx;

  const externalId = typeof r.id === "string" && !/[\u0000-\u001f\u007f]/.test(r.id) ? r.id.trim() : "";
  if (!externalId || externalId.length > 200) return { ok: false, error: "sem identificador (id)" };

  if (typeof r.date !== "string" && !(r.date instanceof Date)) return { ok: false, error: `${externalId}: sem data` };
  let occurredAt: Date | null;
  let dateKey: string;
  const dateOnly = typeof r.date === "string" ? DATE_ONLY.exec(r.date.trim()) : null;
  if (dateOnly) {
    // Só o dia: vale o dia informado (não o dia anterior que a meia-noite UTC daria em São Paulo).
    const noon = new Date(`${dateOnly[1]}T12:00:00Z`);
    if (Number.isNaN(noon.getTime())) return { ok: false, error: `${externalId}: data inválida` };
    occurredAt = null;
    dateKey = dateOnly[1];
  } else {
    const instant = new Date(r.date as string | Date);
    if (Number.isNaN(instant.getTime())) return { ok: false, error: `${externalId}: data inválida` };
    if (r.date instanceof Date && instant.getTime() % DAY_MS === 0) {
      occurredAt = null;
      dateKey = instant.toISOString().slice(0, 10);
    } else {
      occurredAt = instant;
      dateKey = spDateKey(instant);
    }
  }
  const reference = occurredAt ?? spStartOfDay(dateKey);
  if (reference.getTime() < MIN_DATE || reference.getTime() > now.getTime() + MAX_FUTURE_MS) {
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

// ------------------------------------------------------------------------------------------------
// Pareamento (mesmo lançamento visto por duas fontes: arquivo e banco)
// ------------------------------------------------------------------------------------------------

export type PairInput = {
  /** Dia em São Paulo ("YYYY-MM-DD"). */
  dateKey: string;
  direction: BankDirection;
  cents: number;
  /** Texto livre (descrição/contraparte) usado só para desempatar quando há vários iguais no dia. */
  text: string;
  /** Desempate final (ordem natural da fonte). */
  order: number;
  /** Preferência do lado "banco" (menor = casa primeiro). */
  rank?: number;
};

function dayNumber(dateKey: string): number {
  return Math.round(Date.parse(`${dateKey}T00:00:00Z`) / DAY_MS);
}

function tokensOf(text: string): Set<string> {
  const normalized = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return new Set(normalized.split(/[^a-z0-9]+/).filter((t) => t.length >= 3));
}

function similarity(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

/**
 * Casa lançamentos de dois lados que são o MESMO fato visto por fontes diferentes (ex.: linha do
 * extrato em arquivo × lançamento do banco). Primeiro pelo dia exato + sentido + valor (um para um,
 * preferindo o texto mais parecido quando há vários iguais); depois, para o que sobrou, aceita a
 * diferença de 1 dia (data contábil × data do banco) só quando o par é ÚNICO dos dois lados — se
 * houver dúvida, não casa (melhor deixar duplicado e avisar do que juntar lançamentos diferentes).
 */
export function pairTransactions(left: PairInput[], right: PairInput[]): { left: number; right: number }[] {
  const usedL = new Set<number>();
  const usedR = new Set<number>();
  const pairs: { left: number; right: number }[] = [];
  const leftTokens = left.map((l) => tokensOf(l.text));
  const rightTokens = right.map((r) => tokensOf(r.text));

  // 1) dia exato
  const rightByKey = new Map<string, number[]>();
  right.forEach((r, i) => {
    const key = `${r.dateKey}|${r.direction}|${r.cents}`;
    const list = rightByKey.get(key);
    if (list) list.push(i);
    else rightByKey.set(key, [i]);
  });
  const leftByKey = new Map<string, number[]>();
  left.forEach((l, i) => {
    const key = `${l.dateKey}|${l.direction}|${l.cents}`;
    const list = leftByKey.get(key);
    if (list) list.push(i);
    else leftByKey.set(key, [i]);
  });
  for (const [key, lefts] of leftByKey) {
    const rights = rightByKey.get(key);
    if (!rights) continue;
    const candidates: { l: number; r: number; score: number }[] = [];
    for (const l of lefts) for (const r of rights) candidates.push({ l, r, score: similarity(leftTokens[l], rightTokens[r]) });
    candidates.sort(
      (x, y) =>
        y.score - x.score ||
        (right[x.r].rank ?? 0) - (right[y.r].rank ?? 0) ||
        right[x.r].order - right[y.r].order ||
        left[x.l].order - left[y.l].order
    );
    for (const c of candidates) {
      if (usedL.has(c.l) || usedR.has(c.r)) continue;
      usedL.add(c.l);
      usedR.add(c.r);
      pairs.push({ left: c.l, right: c.r });
    }
  }

  // 2) ±1 dia, só quando único dos dois lados
  const restRightByKey = new Map<string, number[]>();
  right.forEach((r, i) => {
    if (usedR.has(i)) return;
    const key = `${r.direction}|${r.cents}`;
    const list = restRightByKey.get(key);
    if (list) list.push(i);
    else restRightByKey.set(key, [i]);
  });
  const candidatesOfLeft = new Map<number, number[]>();
  const candidatesOfRight = new Map<number, number[]>();
  left.forEach((l, li) => {
    if (usedL.has(li)) return;
    const rights = restRightByKey.get(`${l.direction}|${l.cents}`);
    if (!rights) return;
    for (const ri of rights) {
      if (Math.abs(dayNumber(l.dateKey) - dayNumber(right[ri].dateKey)) > 1) continue;
      candidatesOfLeft.set(li, [...(candidatesOfLeft.get(li) ?? []), ri]);
      candidatesOfRight.set(ri, [...(candidatesOfRight.get(ri) ?? []), li]);
    }
  });
  for (const [li, rights] of candidatesOfLeft) {
    if (rights.length !== 1) continue;
    const ri = rights[0];
    if (candidatesOfRight.get(ri)?.length !== 1) continue;
    pairs.push({ left: li, right: ri });
  }

  return pairs;
}

// ------------------------------------------------------------------------------------------------
// Plano da sincronização
// ------------------------------------------------------------------------------------------------

/** O que o banco de dados já tem gravado de um lançamento da conta (para comparar com o que chegou). */
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
  observacoes?: string | null;
  matchedType?: string | null;
  matchedId?: string | null;
};

export type SyncUpdate = {
  id: string;
  /** Valores novos vindos do banco (gravados por inteiro; a descrição só se `setDescricao`). */
  tx: NormalizedBankTx;
  setDescricao: boolean;
  /** Se valor/sentido mudou num lançamento já conciliado, o vínculo deixa de valer. */
  resetMatch: boolean;
  /** Estava "não compensado" no banco e agora compensou (candidato à conciliação automática). */
  settled: boolean;
};

/** Lançamento de arquivo (sem id do banco) que o banco confirmou: ganha o id do banco sem perder a conciliação. */
export type SyncAdoption = { orphanId: string; tx: NormalizedBankTx };

/** Lançamento "não compensado" que o banco trocou por outro id ao compensar: a mesma linha ganha o id novo. */
export type SyncRekey = { rowId: string; tx: NormalizedBankTx; setDescricao: boolean };

/** Duplicata entre uma linha de arquivo e uma linha do banco que ninguém mexeu: o arquivo assume o id do banco e a do banco sai. */
export type SyncMerge = { orphanId: string; deleteRowId: string; tx: NormalizedBankTx };

export type SyncPlan = {
  creates: NormalizedBankTx[];
  adoptions: SyncAdoption[];
  rekeys: SyncRekey[];
  merges: SyncMerge[];
  /** Linhas de arquivo duplicadas de uma linha do banco já tratada (a do arquivo estava intocada). */
  orphanRemovals: string[];
  updates: SyncUpdate[];
  /** Pendentes no banco que sumiram da janela completa entregue (o banco trocou o lançamento) e estavam intocados. */
  removals: string[];
  unchanged: number;
  /** Duplicatas entre arquivo e banco que não deu para resolver sozinho (as duas linhas foram mexidas). */
  duplicatesLeft: number;
  /** Pendentes sumidos do banco que não foram removidos porque alguém já mexeu neles (precisam de revisão). */
  staleKept: number;
};

export function isUntouched(row: { status: string; matchedType?: string | null; matchedId?: string | null; observacoes?: string | null }) {
  return row.status === "PENDENTE" && !row.matchedType && !row.matchedId && !row.observacoes?.trim();
}

function sameInstant(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a === b;
  return a.getTime() === b.getTime();
}

function rowToTx(row: ExistingBankTx): NormalizedBankTx {
  return {
    externalId: row.externalId as string,
    occurredAt: row.occurredAt,
    dateKey: spDateKey(row.date),
    date: row.date,
    direction: row.direction,
    valor: row.valor,
    descricao: row.descricao,
    counterpart: row.counterpart,
    bankCategory: row.bankCategory,
    paymentMethod: row.paymentMethod,
    pendingAtBank: row.pendingAtBank,
  };
}

function pairInputOfTx(tx: NormalizedBankTx, order: number, rank = 1): PairInput {
  return {
    dateKey: tx.dateKey,
    direction: tx.direction,
    cents: toCents(tx.valor),
    text: `${tx.counterpart ?? ""} ${tx.descricao}`,
    order,
    rank,
  };
}

function pairInputOfRow(row: ExistingBankTx, order: number, rank = 0): PairInput {
  return {
    dateKey: spDateKey(row.date),
    direction: row.direction,
    cents: toCents(row.valor),
    text: `${row.counterpart ?? ""} ${row.descricao}`,
    order,
    rank,
  };
}

/**
 * Decide o que fazer com o lote recebido.
 *  - `existing`: lançamentos da conta que já têm id do banco (os que aparecem no lote, os "não
 *    compensados" perto da faixa e os do banco que coincidem com linhas de arquivo).
 *  - `orphans`: lançamentos da conta SEM id do banco (extratos de arquivo) na faixa coberta.
 *  - `windowComplete` + `window`: a ponte garante que mandou TUDO daquela faixa — pendentes do banco
 *    que não vieram mais (e que ninguém mexeu) são removidos. Sem `window`, vale a faixa do lote.
 */
export function planSync(input: {
  incoming: NormalizedBankTx[];
  existing: ExistingBankTx[];
  orphans: ExistingBankTx[];
  windowComplete?: boolean;
  window?: { from: Date; to: Date };
}): SyncPlan {
  // Mesmo id repetido no lote: vale o último.
  const byId = new Map<string, NormalizedBankTx>();
  for (const tx of input.incoming) byId.set(tx.externalId, tx);
  const incoming = [...byId.values()].sort((a, b) => txInstant(a).getTime() - txInstant(b).getTime());
  const incomingIds = new Set(byId.keys());

  const rows = new Map<string, ExistingBankTx>(); // por id do portal
  for (const e of input.existing) if (e.externalId) rows.set(e.id, e);
  const rowByExternal = new Map<string, ExistingBankTx>();
  for (const e of rows.values()) rowByExternal.set(e.externalId as string, e);

  const plan: SyncPlan = {
    creates: [],
    adoptions: [],
    rekeys: [],
    merges: [],
    orphanRemovals: [],
    updates: [],
    removals: [],
    unchanged: 0,
    duplicatesLeft: 0,
    staleKept: 0,
  };

  // 1) o que já existe é comparado; o resto é "novo".
  const updateOfRow = new Map<string, SyncUpdate | "unchanged">();
  let fresh: NormalizedBankTx[] = [];
  for (const tx of incoming) {
    const current = rowByExternal.get(tx.externalId);
    if (!current) {
      fresh.push(tx);
      continue;
    }
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
    updateOfRow.set(
      current.id,
      changed
        ? {
            id: current.id,
            tx,
            setDescricao,
            resetMatch: valueChanged && current.status === "CONCILIADO",
            settled: current.pendingAtBank && !tx.pendingAtBank,
          }
        : "unchanged"
    );
  }

  // 2) "não compensado" que o banco trocou por outro id ao compensar: a mesma linha ganha o id novo
  //    (assim a conciliação/observação que alguém já fez não se perde nem vira duplicata).
  const consumedPending = new Set<string>();
  const pendingRows = [...rows.values()].filter((r) => r.pendingAtBank && r.externalId && !incomingIds.has(r.externalId));
  if (pendingRows.length > 0 && fresh.length > 0) {
    const pairs = pairTransactions(
      pendingRows.map((r, i) => pairInputOfRow(r, i)),
      fresh.map((t, i) => pairInputOfTx(t, i))
    );
    const rekeyedFresh = new Set<number>();
    for (const p of pairs) {
      const row = pendingRows[p.left];
      plan.rekeys.push({ rowId: row.id, tx: fresh[p.right], setDescricao: row.source === "OPEN_FINANCE" });
      consumedPending.add(row.id);
      rekeyedFresh.add(p.right);
    }
    fresh = fresh.filter((_, i) => !rekeyedFresh.has(i));
  }

  // 3) arquivo × banco: a mesma movimentação vista pelas duas fontes.
  const orphans = [...input.orphans]
    .filter((o) => !o.externalId)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const mergedAway = new Set<string>(); // linhas do banco que saem por fusão
  const adoptedFresh = new Set<number>();
  if (orphans.length > 0) {
    // "Não compensado" que não veio no lote tem destino incerto (pode ser trocado ou removido): fica de fora.
    const bankRows = [...rows.values()].filter(
      (r) =>
        r.source === "OPEN_FINANCE" &&
        r.externalId &&
        !consumedPending.has(r.id) &&
        !(r.pendingAtBank && !incomingIds.has(r.externalId))
    );
    const right: PairInput[] = [
      ...bankRows.map((r, i) => pairInputOfRow(r, i, 0)),
      ...fresh.map((t, i) => pairInputOfTx(t, bankRows.length + i, 1)),
    ];
    const pairs = pairTransactions(
      orphans.map((o, i) => ({
        dateKey: spDateKey(o.date),
        direction: o.direction,
        cents: toCents(o.valor),
        text: o.descricao,
        order: i,
      })),
      right
    );
    pairs.sort((a, b) => a.right - b.right);
    for (const p of pairs) {
      const orphan = orphans[p.left];
      if (p.right >= bankRows.length) {
        const index = p.right - bankRows.length;
        plan.adoptions.push({ orphanId: orphan.id, tx: fresh[index] });
        adoptedFresh.add(index);
        continue;
      }
      const row = bankRows[p.right];
      if (isUntouched(orphan)) {
        plan.orphanRemovals.push(orphan.id);
      } else if (isUntouched(row)) {
        const tx = byId.get(row.externalId as string) ?? rowToTx(row);
        plan.merges.push({ orphanId: orphan.id, deleteRowId: row.id, tx });
        mergedAway.add(row.id);
      } else {
        plan.duplicatesLeft++;
      }
    }
  }
  plan.creates = fresh.filter((_, i) => !adoptedFresh.has(i));

  // 4) atualizações das linhas que continuam existindo.
  for (const [rowId, outcome] of updateOfRow) {
    if (mergedAway.has(rowId)) continue;
    if (outcome === "unchanged") plan.unchanged++;
    else plan.updates.push(outcome);
  }

  // 5) pendentes que sumiram do banco (só com a faixa completa).
  if (input.windowComplete && incoming.length > 0) {
    const from = input.window?.from.getTime() ?? txInstant(incoming[0]).getTime();
    const to = input.window?.to.getTime() ?? txInstant(incoming[incoming.length - 1]).getTime();
    for (const row of rows.values()) {
      if (!row.pendingAtBank || !row.externalId || incomingIds.has(row.externalId)) continue;
      if (consumedPending.has(row.id) || mergedAway.has(row.id)) continue;
      const at = txInstant(row).getTime();
      if (at < from || at > to) continue;
      if (isUntouched(row)) plan.removals.push(row.id);
      else plan.staleKept++;
    }
  }

  return plan;
}
