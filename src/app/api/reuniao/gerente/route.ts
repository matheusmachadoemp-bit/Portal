import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { computeGerenteMetrics, loadGerenteCustomIndicators } from "@/lib/reuniao-server";
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

  const customIndicators = ctx.mode === "single" ? await loadGerenteCustomIndicators(ctx.empresa.id, periodo) : [];

  return NextResponse.json({ meetings, current, metrics, periodo, customIndicators });
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
    notas: body.notas || null,
  };

  const meeting = await prisma.gerenteMeeting.upsert({
    where: { empresaId_periodo: { empresaId: empresa.id, periodo } },
    update: data,
    create: { ...data, empresaId: empresa.id, periodo, createdById: session.user.id },
  });

  // Lista de indicadores da seção "Fechamento do mês" — inclui tanto os 4
  // migrados de GerenteMeeting (Faturamento Total, CMV, Turnover, Checklist
  // Operacional) quanto os criados livremente (ex.: Ticket Médio Salão/
  // Delivery); nenhuma distinção de código entre eles a partir daqui.
  const customIndicators: { id: string; valor?: string; valorReferencia?: string }[] = Array.isArray(body.customIndicators)
    ? body.customIndicators
    : [];
  if (customIndicators.length > 0) {
    const indicators = await prisma.gerenteCustomIndicator.findMany({
      where: { id: { in: customIndicators.map((c) => c.id) }, empresaId: empresa.id },
    });
    const indicatorById = new Map(indicators.map((i) => [i.id, i]));
    await Promise.all(
      customIndicators
        .filter((c) => indicatorById.has(c.id))
        .map((c) => {
          const indicator = indicatorById.get(c.id)!;
          const valor = c.valor !== undefined && c.valor !== "" ? Number(c.valor) : null;
          const valorReferencia =
            c.valorReferencia !== undefined && c.valorReferencia !== "" ? Number(c.valorReferencia) : indicator.valorPadrao;
          return prisma.gerenteCustomIndicatorValue.upsert({
            where: { indicatorId_periodo: { indicatorId: c.id, periodo } },
            update: { valor, valorReferencia },
            create: { indicatorId: c.id, periodo, valor, valorReferencia },
          });
        })
    );
  }

  return NextResponse.json({ meeting });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Excluir um fechamento de mês já lançado é mais destrutivo que criar/editar (perde o
  // histórico de metas/premiação daquele período) — por isso exige canDelete, não canEdit,
  // mesmo critério de checklist/templates (DELETE) e tarefas (DELETE).
  if (!(await hasModulePermission(session.user.id, "reuniao", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir o fechamento da reunião de gerente." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível excluir no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(req.url);
  const periodo = searchParams.get("periodo");
  if (!periodo) return NextResponse.json({ error: "Período não informado." }, { status: 400 });

  await prisma.gerenteMeeting.deleteMany({ where: { empresaId: empresa.id, periodo } });

  return NextResponse.json({ ok: true });
}
