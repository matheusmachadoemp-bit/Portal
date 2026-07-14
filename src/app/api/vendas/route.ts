import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const entries = await prisma.salesEntry.findMany({
    where: from && to ? { date: { gte: new Date(from), lte: new Date(to) } } : undefined,
    orderBy: { date: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  return NextResponse.json({ entries });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  const entry = await prisma.salesEntry.create({
    data: {
      date: new Date(body.date),
      periodType: body.periodType ?? "DIARIO",
      faturamentoDelivery: Number(body.faturamentoDelivery) || 0,
      faturamentoSalao: Number(body.faturamentoSalao) || 0,
      pedidosDelivery: Number(body.pedidosDelivery) || 0,
      pedidosBalcao: Number(body.pedidosBalcao) || 0,
      pedidosSalao: Number(body.pedidosSalao) || 0,
      mesasAtendidas: Number(body.mesasAtendidas) || 0,
      taxaServicoValor: Number(body.taxaServicoValor) || 0,
      metaDiaria: Number(body.metaDiaria) || 0,
      observacoes: body.observacoes || null,
      createdById: session.user.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "CREATE",
      entityType: "SalesEntry",
      entityId: entry.id,
      after: JSON.stringify(entry),
    },
  });

  return NextResponse.json({ entry });
}
