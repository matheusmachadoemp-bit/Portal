import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const bankAccountId = searchParams.get("bankAccountId");
  const status = searchParams.get("status");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where = {
    empresaId: { in: empresaIdsForContext(ctx) },
    ...(bankAccountId ? { bankAccountId } : {}),
    ...(status ? { status: status as never } : {}),
    ...(from && to ? { date: { gte: new Date(from), lte: new Date(to) } } : {}),
  };

  const [transactions, totals] = await Promise.all([
    prisma.bankTransaction.findMany({
      where,
      orderBy: { date: "desc" },
      include: { bankAccount: true, import: { select: { fileName: true } } },
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

  return NextResponse.json({ transactions, summary });
}
