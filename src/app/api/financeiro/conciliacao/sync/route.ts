import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BankSyncBusyError, syncBankTransactions } from "@/lib/bank-sync-server";

/**
 * Entrada dos lançamentos do banco (Open Finance) na Conciliação Bancária.
 *
 * Quem chama NÃO é uma pessoa logada: é a "ponte" (hoje, uma rotina agendada do Claude que lê a
 * conexão com o banco; amanhã pode ser um cron do próprio portal ou uma API do banco). Por isso a
 * autenticação é uma senha de integração própria (`BANK_SYNC_SECRET`, no Authorization: Bearer),
 * separada do `CRON_SECRET` — assim quem tem esta senha NÃO aciona os outros agendamentos do portal.
 * Alcance dela: escrever lançamentos nas contas já vinculadas (inclusive corrigir valor/sentido dos
 * que vieram do banco e, com `windowComplete`, apagar "não compensados" intocados que o banco não
 * lista mais) e ler a contagem/datas pelo GET. Não lê descrições, não toca em contas a pagar/receber
 * e não mexe em lançamentos de outras lojas (a loja vem SEMPRE da conta vinculada, nunca do corpo).
 * Para trocar a senha: gere outra, atualize `BANK_SYNC_SECRET` no Vercel e na rotina, e faça o redeploy.
 * O middleware deixa esta rota passar sem sessão (ver PUBLIC_PATHS em src/middleware.ts); a checagem
 * da senha é aqui, e sem a variável configurada a rota recusa tudo.
 */
export const maxDuration = 60;

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_ROWS = 2000;
const MIN_SECRET_LENGTH = 32;
/** Teto de saldo aceito (um valor absurdo quase sempre é erro de formato, não saldo de verdade). */
const MAX_BALANCE = 1e12;

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

/** Lê a senha da variável de ambiente tirando espaços, quebras de linha e aspas coladas junto por engano. */
function configuredSecret(): string | null {
  const raw = process.env.BANK_SYNC_SECRET;
  if (!raw) return null;
  const secret = raw.trim().replace(/^(["'])(.*)\1$/, "$2").trim();
  return secret.length >= MIN_SECRET_LENGTH ? secret : null; // não configurada (ou fraca demais)
}

function isAuthorized(req: Request): boolean | null {
  const secret = configuredSecret();
  if (!secret) return null;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return timingSafeEqual(digest(token), digest(secret));
}

async function findLinkedAccount(openFinanceAccountId: unknown) {
  if (typeof openFinanceAccountId !== "string" || !openFinanceAccountId.trim() || openFinanceAccountId.length > 200) {
    return null;
  }
  return prisma.bankAccount.findFirst({
    where: { openFinanceAccountId: openFinanceAccountId.trim(), active: true },
    select: { id: true, empresaId: true, lastSyncAt: true },
  });
}

/** Estado da conta vinculada: a ponte usa para buscar só o que é novo. */
export async function GET(req: Request) {
  const authorized = isAuthorized(req);
  if (authorized === null) {
    return NextResponse.json({ error: "Sincronização com o banco não configurada." }, { status: 503 });
  }
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const account = await findLinkedAccount(searchParams.get("openFinanceAccountId"));
  if (!account) return NextResponse.json({ error: "Conta não vinculada a nenhuma conta do portal." }, { status: 404 });

  const [newest, count] = await Promise.all([
    prisma.bankTransaction.findFirst({
      where: { bankAccountId: account.id, externalId: { not: null } },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true },
    }),
    prisma.bankTransaction.count({ where: { bankAccountId: account.id, externalId: { not: null } } }),
  ]);
  return NextResponse.json({
    linked: true,
    lastSyncAt: account.lastSyncAt,
    newestTransactionAt: newest?.occurredAt ?? null,
    transactionsFromBank: count,
  });
}

export async function POST(req: Request) {
  const authorized = isAuthorized(req);
  if (authorized === null) {
    return NextResponse.json({ error: "Sincronização com o banco não configurada." }, { status: 503 });
  }
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Lote grande demais. Envie em partes (até 2000 lançamentos por vez)." }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Lote grande demais. Envie em partes (até 2000 lançamentos por vez)." }, { status: 413 });
    }
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("corpo inválido");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido (esperado JSON)." }, { status: 400 });
  }

  const account = await findLinkedAccount(body.openFinanceAccountId);
  if (!account) return NextResponse.json({ error: "Conta não vinculada a nenhuma conta do portal." }, { status: 404 });

  if (!Array.isArray(body.transactions)) {
    return NextResponse.json({ error: "Informe a lista `transactions`." }, { status: 400 });
  }
  if (body.transactions.length > MAX_ROWS) {
    return NextResponse.json({ error: `Muitos lançamentos de uma vez (máximo ${MAX_ROWS}). Envie em partes.` }, { status: 413 });
  }

  const result = await syncBankTransactions({
    bankAccount: { id: account.id, empresaId: account.empresaId },
    rows: body.transactions,
    balance: parseBalance(body.balance),
    windowComplete: body.windowComplete === true,
    window: parseWindow(body.windowFrom, body.windowTo),
  }).catch((error) => {
    if (error instanceof BankSyncBusyError) return null;
    throw error;
  });
  if (!result) {
    return NextResponse.json(
      { error: "Já existe uma sincronização desta conta em andamento. Tente de novo em instantes." },
      { status: 409, headers: { "Retry-After": "15" } }
    );
  }

  // Lote inteiro inválido: nada foi gravado. Avisa a ponte (algo mudou no formato) em vez de fingir que deu certo.
  if (result.received > 0 && result.valid === 0) {
    return NextResponse.json({ error: "Nenhum lançamento válido no lote.", ...result }, { status: 422 });
  }
  return NextResponse.json({ ok: true, ...result });
}

/** Saldo informado pela ponte: número ou texto ("1.234,56" não; "1234.56" ou "1234,56" sim). Vazio/absurdo = ignora. */
function parseBalance(value: unknown): number | null {
  let n: number;
  if (typeof value === "number") n = value;
  else if (typeof value === "string") {
    const text = value.trim().replace(",", ".");
    if (!text) return null;
    n = Number(text);
  } else return null;
  return Number.isFinite(n) && Math.abs(n) <= MAX_BALANCE ? n : null;
}

/** Período que a ponte pediu ao banco (`windowFrom`/`windowTo`, datas ISO). Os dois ou nenhum. */
function parseWindow(from: unknown, to: unknown): { from: Date; to: Date } | null {
  if (typeof from !== "string" || typeof to !== "string") return null;
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || a.getTime() > b.getTime()) return null;
  return { from: a, to: b };
}
