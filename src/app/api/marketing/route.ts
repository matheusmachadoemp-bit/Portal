import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const entries = await prisma.marketingEntry.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) } },
    orderBy: { date: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  return NextResponse.json({ entries });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível lançar dados no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();

  const entry = await prisma.marketingEntry.create({
    data: {
      empresaId: empresa.id,
      date: new Date(body.date),
      investimentoTrafego: Number(body.investimentoTrafego) || 0,
      receitaTrafego: Number(body.receitaTrafego) || 0,
      pedidosCampanha: Number(body.pedidosCampanha) || 0,
      visitasSite: Number(body.visitasSite) || 0,
      conversoes: Number(body.conversoes) || 0,
      seguidoresInicio: Number(body.seguidoresInicio) || 0,
      seguidoresFim: Number(body.seguidoresFim) || 0,
      curtidas: Number(body.curtidas) || 0,
      comentarios: Number(body.comentarios) || 0,
      compartilhamentos: Number(body.compartilhamentos) || 0,
      salvamentos: Number(body.salvamentos) || 0,
      alcance: Number(body.alcance) || 0,
      impressoes: Number(body.impressoes) || 0,
      observacoes: body.observacoes || null,
      planoDeAcao: body.planoDeAcao || null,
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ entry });
}
