import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { resolveMatchLabels } from "@/lib/bank-reconciliation";
import { hasModulePermission } from "@/lib/authz";
import { spEndOfDay, spStartOfDay } from "@/lib/timezone";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "financeiro", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o Financeiro." },
      { status: 403 }
    );
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const bankAccountId = searchParams.get("bankAccountId");
  const status = searchParams.get("status");
  const direction = searchParams.get("direction");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  // Período em DIAS de São Paulo ("YYYY-MM-DD"), inclusive nas duas pontas: os lançamentos ficam
  // gravados em meia-noite de SP, então "até 31/07" precisa ir até o fim desse dia (e não até a
  // meia-noite UTC de 31/07, que cortava o último dia). Aceita só início, só fim, ou os dois.
  const validFrom = from && DATE_KEY.test(from) ? spStartOfDay(from) : null;
  const validTo = to && DATE_KEY.test(to) ? spEndOfDay(to) : null;
  if ((validFrom && Number.isNaN(validFrom.getTime())) || (validTo && Number.isNaN(validTo.getTime()))) {
    return NextResponse.json({ error: "Período inválido." }, { status: 400 });
  }

  const where = {
    empresaId: { in: empresaIdsForContext(ctx) },
    ...(bankAccountId ? { bankAccountId } : {}),
    ...(status ? { status: status as never } : {}),
    ...(direction === "ENTRADA" || direction === "SAIDA" ? { direction: direction as "ENTRADA" | "SAIDA" } : {}),
    ...(validFrom || validTo ? { date: { ...(validFrom ? { gte: validFrom } : {}), ...(validTo ? { lte: validTo } : {}) } } : {}),
  };

  const [transactions, totals] = await Promise.all([
    prisma.bankTransaction.findMany({
      where,
      orderBy: { date: "desc" },
      include: { bankAccount: { select: { name: true } }, import: { select: { fileName: true } } },
    }),
    prisma.bankTransaction.groupBy({
      by: ["direction", "status"],
      where,
      _sum: { valor: true },
      _count: { _all: true },
    }),
  ]);

  const summary = {
    totalEntradas: 0,
    totalSaidas: 0,
    conciliados: 0,
    pendentes: 0,
  };
  for (const t of totals) {
    const valor = t._sum.valor ?? 0;
    if (t.direction === "ENTRADA") summary.totalEntradas += valor;
    else summary.totalSaidas += valor;
    if (t.status === "CONCILIADO") summary.conciliados += t._count._all;
    else if (t.status === "PENDENTE") summary.pendentes += t._count._all;
  }

  const matchLabels = await resolveMatchLabels(transactions);
  const withLabels = transactions.map((t) => ({
    ...t,
    matchedLabel: t.matchedType && t.matchedId ? matchLabels.get(`${t.matchedType}:${t.matchedId}`) ?? null : null,
  }));

  return NextResponse.json({ transactions: withLabels, summary });
}
