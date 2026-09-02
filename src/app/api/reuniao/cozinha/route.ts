import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { currentPeriodo } from "@/lib/reuniao";
import { computeCozinhaMetrics } from "@/lib/reuniao-server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const empresaIds = empresaIdsForContext(ctx);
  const { searchParams } = new URL(req.url);
  const periodo = searchParams.get("periodo") ?? currentPeriodo();

  const meetings = await prisma.kitchenMeeting.findMany({
    where: { empresaId: { in: empresaIds } },
    orderBy: { periodo: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  const current = ctx.mode === "single" ? (meetings.find((m) => m.periodo === periodo) ?? null) : null;
  const latest = meetings[0] ?? null;

  const metrics =
    ctx.mode === "single" ? await computeCozinhaMetrics(ctx.empresa.id, periodo) : { cmvPercent: 0, desperdicioValor: 0, faturamento: 0 };

  return NextResponse.json({ meetings, current: current ?? null, latest, metrics, periodo });
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

  const metrics = await computeCozinhaMetrics(empresa.id, periodo);

  const meeting = await prisma.kitchenMeeting.upsert({
    where: { empresaId_periodo: { empresaId: empresa.id, periodo } },
    update: {
      cmvPercent: metrics.cmvPercent,
      desperdicioValor: metrics.desperdicioValor,
      tempoPedidoMinutos: body.tempoPedidoMinutos !== undefined ? Number(body.tempoPedidoMinutos) || null : undefined,
      organizacaoPercent: body.organizacaoPercent !== undefined ? Number(body.organizacaoPercent) || null : undefined,
      cmvMetaPercent: Number(body.cmvMetaPercent) || 30,
      desperdicioMetaValor: Number(body.desperdicioMetaValor) || 450,
      tempoPedidoMetaMinutos: Number(body.tempoPedidoMetaMinutos) || 15,
      organizacaoMetaPercent: Number(body.organizacaoMetaPercent) || 90,
      premiacaoCmv: Number(body.premiacaoCmv) || 0,
      premiacaoDesperdicio: Number(body.premiacaoDesperdicio) || 0,
      premiacaoTempoPedido: Number(body.premiacaoTempoPedido) || 0,
      premiacaoOrganizacao: Number(body.premiacaoOrganizacao) || 0,
      notas: body.notas || null,
    },
    create: {
      empresaId: empresa.id,
      periodo,
      cmvPercent: metrics.cmvPercent,
      desperdicioValor: metrics.desperdicioValor,
      tempoPedidoMinutos: body.tempoPedidoMinutos !== undefined ? Number(body.tempoPedidoMinutos) || null : null,
      organizacaoPercent: body.organizacaoPercent !== undefined ? Number(body.organizacaoPercent) || null : null,
      cmvMetaPercent: Number(body.cmvMetaPercent) || 30,
      desperdicioMetaValor: Number(body.desperdicioMetaValor) || 450,
      tempoPedidoMetaMinutos: Number(body.tempoPedidoMetaMinutos) || 15,
      organizacaoMetaPercent: Number(body.organizacaoMetaPercent) || 90,
      premiacaoCmv: Number(body.premiacaoCmv) || 0,
      premiacaoDesperdicio: Number(body.premiacaoDesperdicio) || 0,
      premiacaoTempoPedido: Number(body.premiacaoTempoPedido) || 0,
      premiacaoOrganizacao: Number(body.premiacaoOrganizacao) || 0,
      notas: body.notas || null,
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ meeting });
}
