import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { computeLiderancaResumo, loadReuniaoCustomIndicators, upsertReuniaoCustomIndicatorValues } from "@/lib/reuniao-server";
import { currentPeriodo } from "@/lib/reuniao";
import { hasModulePermission } from "@/lib/authz";

/** Resumo "zerado" usado no modo Grupo Nord (várias lojas ao mesmo tempo) — mesmo
 * padrão das outras 4 rotas de reunião: o resumo consolidado só faz sentido loja a loja. */
const EMPTY_RESUMO = {
  faturamentoTotalValor: null,
  cmvPercent: null,
  npsPercent: null,
  cancelamentoDeliveryPercent: null,
  turnoverPercent: null,
  checklistOperacionalPercent: null,
  fontes: { gerente: false, salao: false, cozinha: false, delivery: false },
} as const;

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

  const meetings = await prisma.liderancaMeeting.findMany({
    where: { empresaId: { in: empresaIds } },
    orderBy: { periodo: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  const current = ctx.mode === "single" ? (meetings.find((m) => m.periodo === periodo) ?? null) : null;

  // "Resultado do período" é 100% um resumo consolidado das outras 4 reuniões
  // (ver computeLiderancaResumo) — nunca digitado à mão nem guardado em
  // coluna própria de LiderancaMeeting.
  const resumo = ctx.mode === "single" ? await computeLiderancaResumo(ctx.empresa.id, periodo) : EMPTY_RESUMO;

  const customIndicators = ctx.mode === "single" ? await loadReuniaoCustomIndicators(ctx.empresa.id, "LIDERANCA", periodo) : [];

  return NextResponse.json({ meetings, current, resumo, periodo, customIndicators });
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
      { error: "Seu perfil de permissão não permite lançar o fechamento da reunião de liderança." },
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

  // Só "notas" é próprio de LiderancaMeeting — o resumo consolidado (GET
  // acima) nunca é gravado aqui, é sempre recalculado ao vivo.
  const data = { notas: body.notas || null };

  const meeting = await prisma.liderancaMeeting.upsert({
    where: { empresaId_periodo: { empresaId: empresa.id, periodo } },
    update: data,
    create: { ...data, empresaId: empresa.id, periodo, createdById: session.user.id },
  });

  // Lista de indicadores da seção "Fechamento do mês" — indicadores de nível
  // de liderança que não pertencem a nenhuma área específica (Cozinha/Salão/
  // Delivery/Gerente já têm a própria lista).
  const customIndicators: { id: string; valor?: string; valorReferencia?: string; valorSecundario?: string }[] = Array.isArray(body.customIndicators)
    ? body.customIndicators
    : [];
  await upsertReuniaoCustomIndicatorValues(empresa.id, "LIDERANCA", periodo, customIndicators);

  return NextResponse.json({ meeting });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Excluir um fechamento de mês já lançado é mais destrutivo que criar/editar (perde o
  // histórico de observações daquele período) — por isso exige canDelete, não canEdit,
  // mesmo critério de checklist/templates (DELETE) e tarefas (DELETE).
  if (!(await hasModulePermission(session.user.id, "reuniao", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir o fechamento da reunião de liderança." },
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

  await prisma.liderancaMeeting.deleteMany({ where: { empresaId: empresa.id, periodo } });

  return NextResponse.json({ ok: true });
}
