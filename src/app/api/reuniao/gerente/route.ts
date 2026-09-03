import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { computeGerenteMetrics } from "@/lib/reuniao-server";
import { currentPeriodo } from "@/lib/reuniao";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const empresaIds = empresaIdsForContext(ctx);
  const { searchParams } = new URL(req.url);
  const periodo = searchParams.get("periodo") ?? currentPeriodo();

  const meetings = await prisma.gerenteMeeting.findMany({
    where: { empresaId: { in: empresaIds } },
    orderBy: { periodo: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  const current = ctx.mode === "single" ? (meetings.find((m) => m.periodo === periodo) ?? null) : null;

  const metrics =
    ctx.mode === "single"
      ? await computeGerenteMetrics(ctx.empresa.id, periodo)
      : { faturamentoTotalValor: null, cmvPercent: null, npsPercent: null, cancelamentoDeliveryPercent: null };

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

  const metrics = await computeGerenteMetrics(empresa.id, periodo);

  const data = {
    faturamentoTotalValor: metrics.faturamentoTotalValor,
    cmvPercent: metrics.cmvPercent,
    npsPercent: metrics.npsPercent,
    cancelamentoDeliveryPercent: metrics.cancelamentoDeliveryPercent,
    turnoverPercent: body.turnoverPercent !== undefined && body.turnoverPercent !== "" ? Number(body.turnoverPercent) : null,
    faltasAtrasosAtestados:
      body.faltasAtrasosAtestados !== undefined && body.faltasAtrasosAtestados !== "" ? Number(body.faltasAtrasosAtestados) : null,
    checklistOperacionalPercent:
      body.checklistOperacionalPercent !== undefined && body.checklistOperacionalPercent !== ""
        ? Number(body.checklistOperacionalPercent)
        : null,
    faturamentoMetaValor: Number(body.faturamentoMetaValor) || 0,
    cmvMetaPercent: Number(body.cmvMetaPercent) || 30,
    turnoverMetaPercent: Number(body.turnoverMetaPercent) || 5,
    checklistOperacionalMetaPercent: Number(body.checklistOperacionalMetaPercent) || 90,
    premiacaoFaturamento: Number(body.premiacaoFaturamento) || 0,
    premiacaoCmv: Number(body.premiacaoCmv) || 0,
    premiacaoTurnover: Number(body.premiacaoTurnover) || 0,
    premiacaoChecklist: Number(body.premiacaoChecklist) || 0,
    notas: body.notas || null,
  };

  const meeting = await prisma.gerenteMeeting.upsert({
    where: { empresaId_periodo: { empresaId: empresa.id, periodo } },
    update: data,
    create: { ...data, empresaId: empresa.id, periodo, createdById: session.user.id },
  });

  return NextResponse.json({ meeting });
}
