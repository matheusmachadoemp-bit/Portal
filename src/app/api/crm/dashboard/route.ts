import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { resolvePeriod, type PeriodKey } from "@/lib/periods";

async function summarize(empresaIds: string[], from: Date, to: Date) {
  const [sales, novosClientes, marketingEntries, baseTotal] = await Promise.all([
    prisma.sale.findMany({
      where: { empresaId: { in: empresaIds }, dateTime: { gte: from, lte: to }, clienteId: { not: null } },
      select: { clienteId: true },
    }),
    prisma.cliente.count({ where: { empresaId: { in: empresaIds }, createdAt: { gte: from, lte: to } } }),
    prisma.marketingEntry.findMany({ where: { empresaId: { in: empresaIds }, date: { gte: from, lte: to } }, select: { visitasSite: true, conversoes: true } }),
    prisma.cliente.count({ where: { empresaId: { in: empresaIds } } }),
  ]);

  const countByCliente = new Map<string, number>();
  for (const s of sales) {
    if (!s.clienteId) continue;
    countByCliente.set(s.clienteId, (countByCliente.get(s.clienteId) ?? 0) + 1);
  }
  const clientesAtivos = countByCliente.size;
  const clientesRecorrentes = [...countByCliente.values()].filter((c) => c >= 2).length;
  const visitasSite = marketingEntries.reduce((sum, m) => sum + m.visitasSite, 0);
  const conversoes = marketingEntries.reduce((sum, m) => sum + m.conversoes, 0);

  return {
    novosClientes,
    clientesAtivos,
    clientesRecorrentes,
    taxaRecorrencia: clientesAtivos ? (clientesRecorrentes / clientesAtivos) * 100 : 0,
    baseTotal,
    visitasSite,
    conversoes,
    taxaConversao: visitasSite ? (conversoes / visitasSite) * 100 : 0,
  };
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const { searchParams } = new URL(req.url);
  const key = (searchParams.get("key") ?? "mes") as PeriodKey;
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;

  const { from: periodFrom, to: periodTo } = resolvePeriod(key, { from, to });
  const summary = await summarize(empresaIds, periodFrom, periodTo);

  return NextResponse.json(summary);
}
