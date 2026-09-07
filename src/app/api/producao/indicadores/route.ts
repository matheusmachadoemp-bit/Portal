import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { getIndicadoresData } from "@/lib/producao-indicadores-server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);
  const empresa = await requireActiveSingleEmpresa();

  const { searchParams } = new URL(req.url);
  const days = Number(searchParams.get("days")) || 30;

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);

  const settings = empresa ? await prisma.productionSettings.findUnique({ where: { empresaId: empresa.id } }) : null;
  const data = await getIndicadoresData(empresaIds, from, to, settings?.toleranciaAlertaPct ?? 10);

  return NextResponse.json({ data });
}
