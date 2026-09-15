import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { matchTransactions } from "@/lib/bank-reconciliation";
import { hasModulePermission } from "@/lib/authz";

const OPEN_STATUSES = ["EM_ABERTO", "PARCIALMENTE_PAGO", "ATRASADO"] as const;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "financeiro", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite conciliar lançamentos bancários." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível conciliar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const bankAccountId = body?.bankAccountId as string | undefined;

  const [pendingTransactions, payables, receivables] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: {
        empresaId: empresa.id,
        status: "PENDENTE",
        ...(bankAccountId ? { bankAccountId } : {}),
      },
    }),
    prisma.payable.findMany({
      where: { empresaId: empresa.id, status: { in: [...OPEN_STATUSES] } },
    }),
    prisma.receivable.findMany({
      where: { empresaId: empresa.id, status: { in: [...OPEN_STATUSES] } },
    }),
  ]);

  // Payables/receivables já vinculados a outra transação conciliada não entram no pool.
  const alreadyMatched = await prisma.bankTransaction.findMany({
    where: { empresaId: empresa.id, status: "CONCILIADO", matchedId: { not: null } },
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

  if (matches.size > 0) {
    // Uma única query SQL (`UPDATE ... FROM UNNEST(...)`) em vez de
    // `prisma.$transaction(entries.map((e) => prisma.bankTransaction.update(...)))`
    // — a API de "sequential operations" do Prisma, que roda cada update um
    // atrás do outro dentro de uma transação interativa com timeout padrão
    // de 5s. Um extrato bancário importado pode facilmente ter centenas de
    // transações batendo de uma vez (mesmo bug encontrado e corrigido em
    // `syncEmpresaSaiposSales`, ver `src/lib/saipos-sync.ts`), e isso
    // derrubaria a conciliação inteira sem atualizar nada.
    const transactionIds = [...matches.keys()];
    const types = [...matches.values()].map((m) => m.type);
    const ids = [...matches.values()].map((m) => m.id);

    await prisma.$executeRaw`
      UPDATE "BankTransaction" AS bt
      SET
        "status" = 'CONCILIADO'::"BankTransactionStatus",
        "matchedType" = v.matched_type,
        "matchedId" = v.matched_id,
        "updatedAt" = now()
      FROM UNNEST(${transactionIds}::text[], ${types}::text[], ${ids}::text[])
        AS v(transaction_id, matched_type, matched_id)
      WHERE bt."id" = v.transaction_id
    `;
  }

  return NextResponse.json({ matched: matches.size, pending: pendingTransactions.length });
}
