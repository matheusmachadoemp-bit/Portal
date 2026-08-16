import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { resolveRollingPeriod, type RollingPeriodKey } from "@/lib/periods";
import type { SalePlatform } from "@prisma/client";

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
  const platform = (searchParams.get("platform") as SalePlatform | null) ?? undefined;
  const { from: periodFrom, to: periodTo } = resolveRollingPeriod(key, { from, to });

  const sales = await prisma.sale.findMany({
    where: {
      empresaId: { in: empresaIds },
      cancelado: false,
      channel: "DELIVERY",
      dateTime: { gte: periodFrom, lte: periodTo },
      bairro: { not: null },
      ...(platform ? { platform } : {}),
    },
    select: { bairro: true, valorTotal: true },
  });

  const byBairro = new Map<string, number>();
  for (const s of sales) byBairro.set(s.bairro!, (byBairro.get(s.bairro!) ?? 0) + s.valorTotal);
  const rows = [...byBairro.entries()]
    .map(([bairro, faturamento]) => ({ bairro, faturamento }))
    .sort((a, b) => b.faturamento - a.faturamento)
    .slice(0, 8);

  return NextResponse.json({ rows });
}
