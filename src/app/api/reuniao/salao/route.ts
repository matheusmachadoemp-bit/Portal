import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { computeSalaoMetrics, computeMelhorVendedor, computeComentariosDestaque } from "@/lib/reuniao-server";
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
    include: { createdBy: { select: { name: true } }, produtoMetas: true },
  });

  const current = ctx.mode === "single" ? (meetings.find((m) => m.periodo === periodo) ?? null) : null;

  const metrics =
    ctx.mode === "single"
      ? await computeSalaoMetrics(ctx.empresa.id, periodo)
      : { npsPercent: null, faturamentoValor: 0, ticketMedioValor: null };
  const melhorVendedor =
    ctx.mode === "single" ? await computeMelhorVendedor(ctx.empresa.id, periodo) : { nome: null, valor: null };
  const comentarios = ctx.mode === "single" ? await computeComentariosDestaque(ctx.empresa.id, periodo) : [];

  return NextResponse.json({ meetings, current, metrics, melhorVendedor, comentarios, periodo });
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
  const melhorVendedor = await computeMelhorVendedor(empresa.id, periodo);

  const produtoMetas: { produto: string; quantidade?: string; meta?: string; premiacao?: string }[] = Array.isArray(body.produtoMetas)
    ? body.produtoMetas
    : [];

  const data = {
    npsPercent: metrics.npsPercent,
    faturamentoValor: metrics.faturamentoValor,
    ticketMedioValor: metrics.ticketMedioValor,
    melhorVendedorNome: melhorVendedor.nome,
    melhorVendedorValor: melhorVendedor.valor,
    npsMetaPercent: Number(body.npsMetaPercent) || 80,
    faturamentoMetaValor: Number(body.faturamentoMetaValor) || 0,
    ticketMedioMetaValor: Number(body.ticketMedioMetaValor) || 0,
    premiacaoNps: Number(body.premiacaoNps) || 0,
    premiacaoFaturamento: Number(body.premiacaoFaturamento) || 0,
    premiacaoTicketMedio: Number(body.premiacaoTicketMedio) || 0,
    npsQualidadeProduto: body.npsQualidadeProduto !== undefined && body.npsQualidadeProduto !== "" ? Number(body.npsQualidadeProduto) : null,
    npsAtendimento: body.npsAtendimento !== undefined && body.npsAtendimento !== "" ? Number(body.npsAtendimento) : null,
    npsAmbiente: body.npsAmbiente !== undefined && body.npsAmbiente !== "" ? Number(body.npsAmbiente) : null,
    npsRodizio: body.npsRodizio !== undefined && body.npsRodizio !== "" ? Number(body.npsRodizio) : null,
    npsTempoEspera: body.npsTempoEspera !== undefined && body.npsTempoEspera !== "" ? Number(body.npsTempoEspera) : null,
    notas: body.notas || null,
  };

  const meeting = await prisma.salaoMeeting.upsert({
    where: { empresaId_periodo: { empresaId: empresa.id, periodo } },
    update: data,
    create: { ...data, empresaId: empresa.id, periodo, createdById: session.user.id },
  });

  for (const pm of produtoMetas) {
    const quantidade = pm.quantidade !== undefined && pm.quantidade !== "" ? Number(pm.quantidade) : null;
    const meta = Number(pm.meta) || 0;
    const premiacao = Number(pm.premiacao) || 0;
    await prisma.salaoProductGoal.upsert({
      where: { meetingId_produto: { meetingId: meeting.id, produto: pm.produto } },
      update: { quantidade, meta, premiacao },
      create: { meetingId: meeting.id, produto: pm.produto, quantidade, meta, premiacao },
    });
  }

  const full = await prisma.salaoMeeting.findUnique({ where: { id: meeting.id }, include: { produtoMetas: true } });
  return NextResponse.json({ meeting: full });
}
