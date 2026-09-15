import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { computeDeliveryMetrics, loadReuniaoCustomIndicators, upsertReuniaoCustomIndicatorValues } from "@/lib/reuniao-server";
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

  const meetings = await prisma.deliveryMeeting.findMany({
    where: { empresaId: { in: empresaIds } },
    orderBy: { periodo: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  const current = ctx.mode === "single" ? (meetings.find((m) => m.periodo === periodo) ?? null) : null;

  const metrics = ctx.mode === "single" ? await computeDeliveryMetrics(ctx.empresa.id, periodo) : { cancelamentoPercent: null };
  const customIndicators = ctx.mode === "single" ? await loadReuniaoCustomIndicators(ctx.empresa.id, "DELIVERY", periodo) : [];

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
    notas: body.notas || null,
  };

  const meeting = await prisma.deliveryMeeting.upsert({
    where: { empresaId_periodo: { empresaId: empresa.id, periodo } },
    update: data,
    create: { ...data, empresaId: empresa.id, periodo, createdById: session.user.id },
  });

  // Lista de indicadores da seção "Fechamento do mês" (Cancelamento,
  // Avaliação, Tempo de Entrega, Chamados migrados + qualquer um criado
  // livremente) — nenhuma distinção de código entre eles a partir daqui.
  const customIndicators: { id: string; valor?: string; valorReferencia?: string; valorSecundario?: string }[] = Array.isArray(body.customIndicators)
    ? body.customIndicators
    : [];
  await upsertReuniaoCustomIndicatorValues(empresa.id, "DELIVERY", periodo, customIndicators);

  return NextResponse.json({ meeting });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Excluir um fechamento de mês já lançado é mais destrutivo que criar/editar (perde o
  // histórico de resultados/observações daquele período) — por isso exige canDelete, não
  // canEdit, mesmo critério de checklist/templates (DELETE) e tarefas (DELETE).
  if (!(await hasModulePermission(session.user.id, "reuniao", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir o fechamento da reunião de delivery." },
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

  await prisma.deliveryMeeting.deleteMany({ where: { empresaId: empresa.id, periodo } });

  return NextResponse.json({ ok: true });
}
