import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { currentPeriodo } from "@/lib/reuniao";
import { computeCozinhaMetrics, loadReuniaoCustomIndicators, upsertReuniaoCustomIndicatorValues } from "@/lib/reuniao-server";
import { hasModulePermission } from "@/lib/authz";

// Converte pra número, preservando 0 como valor válido — só cai em null quando o
// valor vier vazio/ausente/não-numérico (evitar o clássico bug de `Number(v) || null`
// tratar 0 como "ausente"). Trata string vazia à parte porque `Number("")` é 0, não NaN.
function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

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

  const meetings = await prisma.kitchenMeeting.findMany({
    where: { empresaId: { in: empresaIds } },
    orderBy: { periodo: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  const current = ctx.mode === "single" ? (meetings.find((m) => m.periodo === periodo) ?? null) : null;
  const latest = meetings[0] ?? null;

  const metrics =
    ctx.mode === "single" ? await computeCozinhaMetrics(ctx.empresa.id, periodo) : { cmvPercent: 0, desperdicioValor: 0, faturamento: 0 };
  const customIndicators = ctx.mode === "single" ? await loadReuniaoCustomIndicators(ctx.empresa.id, "COZINHA", periodo) : [];

  return NextResponse.json({ meetings, current: current ?? null, latest, metrics, periodo, customIndicators });
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
      { error: "Seu perfil de permissão não permite lançar o fechamento da reunião de cozinha." },
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

  const metrics = await computeCozinhaMetrics(empresa.id, periodo);

  const meeting = await prisma.kitchenMeeting.upsert({
    where: { empresaId_periodo: { empresaId: empresa.id, periodo } },
    update: {
      cmvPercent: metrics.cmvPercent,
      desperdicioValor: metrics.desperdicioValor,
      tempoPedidoMinutos: body.tempoPedidoMinutos !== undefined ? toNullableNumber(body.tempoPedidoMinutos) : undefined,
      organizacaoPercent: body.organizacaoPercent !== undefined ? toNullableNumber(body.organizacaoPercent) : undefined,
      notas: body.notas || null,
    },
    create: {
      empresaId: empresa.id,
      periodo,
      cmvPercent: metrics.cmvPercent,
      desperdicioValor: metrics.desperdicioValor,
      tempoPedidoMinutos: body.tempoPedidoMinutos !== undefined ? toNullableNumber(body.tempoPedidoMinutos) : null,
      organizacaoPercent: body.organizacaoPercent !== undefined ? toNullableNumber(body.organizacaoPercent) : null,
      notas: body.notas || null,
      createdById: session.user.id,
    },
  });

  // Lista de indicadores da seção "Fechamento do mês" (CMV, Desperdício,
  // Tempo Pedido, Organização migrados + qualquer um criado livremente) —
  // nenhuma distinção de código entre eles a partir daqui.
  const customIndicators: { id: string; valor?: string; valorReferencia?: string; valorSecundario?: string }[] = Array.isArray(body.customIndicators)
    ? body.customIndicators
    : [];
  await upsertReuniaoCustomIndicatorValues(empresa.id, "COZINHA", periodo, customIndicators);

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
      { error: "Seu perfil de permissão não permite excluir o fechamento da reunião de cozinha." },
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

  await prisma.kitchenMeeting.deleteMany({ where: { empresaId: empresa.id, periodo } });

  return NextResponse.json({ ok: true });
}
