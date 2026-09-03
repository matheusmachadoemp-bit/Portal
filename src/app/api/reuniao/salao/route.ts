import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { computeSalaoMetrics } from "@/lib/reuniao-server";
import { currentPeriodo } from "@/lib/reuniao";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const empresaIds = empresaIdsForContext(ctx);
  const { searchParams } = new URL(req.url);
  const periodo = searchParams.get("periodo") ?? currentPeriodo();

  const meetings = await prisma.salaoMeeting.findMany({
    where: { empresaId: { in: empresaIds } },
    orderBy: { periodo: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  const current = ctx.mode === "single" ? (meetings.find((m) => m.periodo === periodo) ?? null) : null;

  const metrics =
    ctx.mode === "single" ? await computeSalaoMetrics(ctx.empresa.id, periodo) : { npsPercent: null, faturamentoValor: 0, ticketMedioValor: null };

  return NextResponse.json({ meetings, current, metrics, periodo });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível lançar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();
  const periodo = String(body.periodo ?? currentPeriodo());

  const metrics = await computeSalaoMetrics(empresa.id, periodo);

  const meeting = await prisma.salaoMeeting.upsert({
    where: { empresaId_periodo: { empresaId: empresa.id, periodo } },
    update: {
      npsPercent: metrics.npsPercent,
      faturamentoValor: metrics.faturamentoValor,
      ticketMedioValor: metrics.ticketMedioValor,
      npsMetaPercent: Number(body.npsMetaPercent) || 80,
      faturamentoMetaValor: Number(body.faturamentoMetaValor) || 0,
      ticketMedioMetaValor: Number(body.ticketMedioMetaValor) || 0,
      premiacaoNps: Number(body.premiacaoNps) || 0,
      premiacaoFaturamento: Number(body.premiacaoFaturamento) || 0,
      premiacaoTicketMedio: Number(body.premiacaoTicketMedio) || 0,
      notas: body.notas || null,
    },
    create: {
      empresaId: empresa.id,
      periodo,
      npsPercent: metrics.npsPercent,
      faturamentoValor: metrics.faturamentoValor,
      ticketMedioValor: metrics.ticketMedioValor,
      npsMetaPercent: Number(body.npsMetaPercent) || 80,
      faturamentoMetaValor: Number(body.faturamentoMetaValor) || 0,
      ticketMedioMetaValor: Number(body.ticketMedioMetaValor) || 0,
      premiacaoNps: Number(body.premiacaoNps) || 0,
      premiacaoFaturamento: Number(body.premiacaoFaturamento) || 0,
      premiacaoTicketMedio: Number(body.premiacaoTicketMedio) || 0,
      notas: body.notas || null,
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ meeting });
}
