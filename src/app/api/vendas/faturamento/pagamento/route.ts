import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { resolveRollingPeriod, type RollingPeriodKey } from "@/lib/periods";
import { PAYMENT_METHOD_LABEL, SALE_PAYMENT_METHODS } from "@/lib/vendas-analytics";
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
    select: { formaPagamento: true, valorTotal: true },
  });

  const total = sales.reduce((sum, s) => sum + s.valorTotal, 0);
  const byMethod = SALE_PAYMENT_METHODS.map((method) => {
    const valor = sales.filter((s) => s.formaPagamento === method).reduce((sum, s) => sum + s.valorTotal, 0);
    return { method, label: PAYMENT_METHOD_LABEL[method], valor, percent: total ? (valor / total) * 100 : 0 };
  }).filter((m) => m.valor > 0);

  return NextResponse.json({ byMethod, pedidos: sales.length });
}
