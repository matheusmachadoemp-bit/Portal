import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { computeDeliveryMetrics } from "@/lib/reuniao-server";
import { currentPeriodo } from "@/lib/reuniao";
import { hasModulePermission } from "@/lib/authz";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const empresaIds = empresaIdsForContext(ctx);
  const { searchParams } = new URL(req.url);
  const periodo = searchParams.get("periodo") ?? currentPeriodo();

  const meetings = await prisma.deliveryMeeting.findMany({
    where: { empresaId: { in: empresaIds } },
    orderBy: { periodo: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  const current = ctx.mode === "single" ? (meetings.find((m) => m.periodo === periodo) ?? null) : null;

  const metrics = ctx.mode === "single" ? await computeDeliveryMetrics(ctx.empresa.id, periodo) : { cancelamentoPercent: null };

  return NextResponse.json({ meetings, current, metrics, periodo });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Upsert do fechamento do período (mesmo endpoint cria ou atualiza, sem rota de edição
  // separada, e a própria tela já rotula o botão como "Atualizar" quando o período já existe) —
  // mesmo critério já usado em configurações e em checklist/occurrences/responses: trata como
  // canEdit.
  if (!(await hasModulePermission(session.user.id, "reuniao", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite lançar o fechamento da reunião de delivery." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível lançar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();
  const periodo = String(body.periodo ?? currentPeriodo());

  const metrics = await computeDeliveryMetrics(empresa.id, periodo);

  const data = {
    cancelamentoPercent: metrics.cancelamentoPercent,
    avaliacaoNota: body.avaliacaoNota !== undefined && body.avaliacaoNota !== "" ? Number(body.avaliacaoNota) : null,
    tempoEntregaMinutos: body.tempoEntregaMinutos !== undefined && body.tempoEntregaMinutos !== "" ? Number(body.tempoEntregaMinutos) : null,
    chamadosPercent: body.chamadosPercent !== undefined && body.chamadosPercent !== "" ? Number(body.chamadosPercent) : null,
    cancelamentoMetaPercent: Number(body.cancelamentoMetaPercent) || 1,
    avaliacaoMetaNota: Number(body.avaliacaoMetaNota) || 4.7,
    tempoEntregaMetaMinutos: Number(body.tempoEntregaMetaMinutos) || 40,
    chamadosMetaPercent: Number(body.chamadosMetaPercent) || 2.5,
    premiacaoCancelamento: Number(body.premiacaoCancelamento) || 0,
    premiacaoAvaliacao: Number(body.premiacaoAvaliacao) || 0,
    premiacaoTempoEntrega: Number(body.premiacaoTempoEntrega) || 0,
    premiacaoChamados: Number(body.premiacaoChamados) || 0,
    notas: body.notas || null,
  };

  const meeting = await prisma.deliveryMeeting.upsert({
    where: { empresaId_periodo: { empresaId: empresa.id, periodo } },
    update: data,
    create: { ...data, empresaId: empresa.id, periodo, createdById: session.user.id },
  });

  return NextResponse.json({ meeting });
}
