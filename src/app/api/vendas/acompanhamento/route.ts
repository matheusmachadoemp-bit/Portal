import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { computeAcompanhamento } from "@/lib/acompanhamento-analytics";
import type { Turno } from "@/lib/vendas-analytics";
import type { SalePlatform } from "@prisma/client";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const { searchParams } = new URL(req.url);
  const fromA = searchParams.get("fromA");
  const toA = searchParams.get("toA");
  const fromB = searchParams.get("fromB");
  const toB = searchParams.get("toB");
  if (!fromA || !toA || !fromB || !toB) {
    return NextResponse.json({ error: "Informe as datas A e B." }, { status: 400 });
  }

  const result = await computeAcompanhamento(empresaIds, {
    fromA,
    toA,
    fromB,
    toB,
    turno: (searchParams.get("turno") as Turno | null) ?? undefined,
    platform: (searchParams.get("platform") as SalePlatform | null) ?? undefined,
  });

  return NextResponse.json(result);
}
