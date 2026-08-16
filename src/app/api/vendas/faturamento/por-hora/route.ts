import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { resolveRollingPeriod, type RollingPeriodKey } from "@/lib/periods";
import { buildHalfHourBuckets } from "@/lib/faturamento-analytics";
import type { SaleChannel, SalePlatform } from "@prisma/client";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const { searchParams } = new URL(req.url);
  const key = (searchParams.get("key") ?? "30dias") as RollingPeriodKey;
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const channel = (searchParams.get("channel") as SaleChannel | null) ?? undefined;
  const platform = (searchParams.get("platform") as SalePlatform | null) ?? undefined;
  const { from: periodFrom, to: periodTo } = resolveRollingPeriod(key, { from, to });

  const sales = await prisma.sale.findMany({
    where: {
      empresaId: { in: empresaIds },
      cancelado: false,
      dateTime: { gte: periodFrom, lte: periodTo },
      ...(channel ? { channel } : {}),
      ...(platform ? { platform } : {}),
    },
    select: { dateTime: true, valorTotal: true },
  });

  const byHour = buildHalfHourBuckets(sales);
  const pico = [...byHour].sort((a, b) => b.faturamento - a.faturamento)[0];

  return NextResponse.json({ byHour, pico: pico?.pedidos ? pico : null });
}
