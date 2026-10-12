import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncBankTransactions } from "@/lib/bank-sync-server";

/**
 * Entrada dos lançamentos do banco (Open Finance) na Conciliação Bancária.
 *
 * Quem chama NÃO é uma pessoa logada: é a "ponte" (hoje, uma rotina agendada do Claude que lê a
 * conexão com o banco; amanhã pode ser um cron do próprio portal ou uma API do banco). Por isso a
 * autenticação é uma senha de integração própria (`BANK_SYNC_SECRET`, no Authorization: Bearer),
 * separada do `CRON_SECRET` — assim quem tem esta senha só consegue ENVIAR lançamentos para contas
 * já vinculadas (e ler a data da última atualização), nunca acionar os outros agendamentos do portal.
 * O middleware deixa esta rota passar sem sessão (ver PUBLIC_PATHS em src/middleware.ts); a checagem
 * da senha é aqui, e sem a variável configurada a rota recusa tudo.
 */
export const maxDuration = 60;

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_ROWS = 2000;

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

function isAuthorized(req: Request): boolean | null {
  const secret = process.env.BANK_SYNC_SECRET;
  if (!secret || secret.length < 16) return null; // não configurada (ou fraca demais)
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
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

  const balance =
    typeof body.balance === "number" ? body.balance : typeof body.balance === "string" ? Number(body.balance) : null;

  const result = await syncBankTransactions({
    bankAccount: { id: account.id, empresaId: account.empresaId },
    rows: body.transactions,
    balance: balance !== null && Number.isFinite(balance) ? balance : null,
    windowComplete: body.windowComplete === true,
  });

  // Lote inteiro inválido: avisa a ponte (algo mudou no formato) em vez de fingir que deu certo.
  if (result.received > 0 && result.valid === 0) {
    return NextResponse.json({ error: "Nenhum lançamento válido no lote.", ...result }, { status: 422 });
  }
  return NextResponse.json({ ok: true, ...result });
}
