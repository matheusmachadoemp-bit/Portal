import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { resolvePeriod, type PeriodKey } from "@/lib/periods";

async function sumRange(empresaIds: string[], from: Date, to: Date) {
  const sales = await prisma.sale.findMany({
    where: { empresaId: { in: empresaIds }, dateTime: { gte: from, lte: to } },
    select: { valorTotal: true },
  });
  const faturamento = sales.reduce((sum, s) => sum + s.valorTotal, 0);
  const pedidos = sales.length;
  return { faturamento, pedidos, ticketMedio: pedidos ? faturamento / pedidos : 0 };
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

  const { from: periodFrom, to: periodTo, prevFrom, prevTo } = resolvePeriod(key, { from, to });

  const [atual, anterior] = await Promise.all([
    sumRange(empresaIds, periodFrom, periodTo),
    sumRange(empresaIds, prevFrom, prevTo),
  ]);

  return NextResponse.json({ atual, anterior, from: periodFrom.toISOString(), to: periodTo.toISOString() });
}
