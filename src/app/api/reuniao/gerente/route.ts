import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { computeGerenteMetrics } from "@/lib/reuniao-server";
import { currentPeriodo } from "@/lib/reuniao";
import { hasModulePermission } from "@/lib/authz";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "reuniao", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver a Reunião." }, { status: 403 });
  }

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
  // Upsert do fechamento do período (mesmo endpoint cria ou atualiza, sem rota de edição
  // separada, e a própria tela já rotula o botão como "Atualizar" quando o período já existe) —
  // mesmo critério já usado em configurações e em checklist/occurrences/responses: trata como
  // canEdit.
  if (!(await hasModulePermission(session.user.id, "reuniao", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite lançar o fechamento da reunião de gerente." },
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
