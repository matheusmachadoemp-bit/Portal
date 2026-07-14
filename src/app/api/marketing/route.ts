import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entries = await prisma.marketingEntry.findMany({
    orderBy: { date: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  return NextResponse.json({ entries });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  const entry = await prisma.marketingEntry.create({
    data: {
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
