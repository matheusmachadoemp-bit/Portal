import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const entries = await prisma.salesEntry.findMany({
    where: {
      empresaId: { in: empresaIdsForContext(ctx) },
      ...(from && to ? { date: { gte: new Date(from), lte: new Date(to) } } : {}),
    },
    orderBy: { date: "desc" },
    include: { createdBy: { select: { name: true } }, empresa: { select: { name: true, color: true } } },
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

  const entry = await prisma.salesEntry.create({
    data: {
      empresaId: empresa.id,
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
      empresaId: empresa.id,
      action: "CREATE",
      entityType: "SalesEntry",
      entityId: entry.id,
      after: JSON.stringify(entry),
    },
  });

  return NextResponse.json({ entry });
}
