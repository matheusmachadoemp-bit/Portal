import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import type { PeriodKey } from "@/lib/periods";
import { computeFaturamentoSummary } from "@/lib/faturamento-analytics";
import type { SaleChannel, SalePlatform } from "@prisma/client";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const { searchParams } = new URL(req.url);
  const summary = await computeFaturamentoSummary(empresaIds, {
    key: (searchParams.get("key") ?? "hoje") as PeriodKey,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    compareMode: searchParams.get("compareMode") === "mesmo-dia-semana" ? "mesmo-dia-semana" : "corrido",
    compareFrom: searchParams.get("compareFrom") ?? undefined,
    compareTo: searchParams.get("compareTo") ?? undefined,
    channel: (searchParams.get("channel") as SaleChannel | null) ?? undefined,
    platform: (searchParams.get("platform") as SalePlatform | null) ?? undefined,
  });

  return NextResponse.json(summary);
}
