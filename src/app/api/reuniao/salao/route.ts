import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import {
  computeSalaoMetrics,
  computeMelhorVendedor,
  computeComentariosDestaque,
  loadReuniaoCustomIndicators,
  upsertReuniaoCustomIndicatorValues,
} from "@/lib/reuniao-server";
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
  const customIndicators = ctx.mode === "single" ? await loadReuniaoCustomIndicators(ctx.empresa.id, "SALAO", periodo) : [];

  return NextResponse.json({ meetings, current, metrics, melhorVendedor, comentarios, periodo, customIndicators });
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
      { error: "Seu perfil de permissão não permite lançar o fechamento da reunião de salão." },
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

  // Lista de indicadores da seção "Fechamento do mês" (NPS Geral, Faturamento
  // do Salão, Ticket Médio migrados + qualquer um criado livremente) —
  // nenhuma distinção de código entre eles a partir daqui.
  const customIndicators: { id: string; valor?: string; valorReferencia?: string; valorSecundario?: string }[] = Array.isArray(body.customIndicators)
    ? body.customIndicators
    : [];
  await upsertReuniaoCustomIndicatorValues(empresa.id, "SALAO", periodo, customIndicators);

  const full = await prisma.salaoMeeting.findUnique({ where: { id: meeting.id }, include: { produtoMetas: true } });
  return NextResponse.json({ meeting: full });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Excluir um fechamento de mês já lançado é mais destrutivo que criar/editar (perde o
  // histórico de resultados/observações daquele período) — por isso exige canDelete, não
  // canEdit, mesmo critério de checklist/templates (DELETE) e tarefas (DELETE).
  if (!(await hasModulePermission(session.user.id, "reuniao", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir o fechamento da reunião de salão." },
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

  // produtoMetas (SalaoProductGoal) têm onDelete: Cascade a partir de SalaoMeeting.
  await prisma.salaoMeeting.deleteMany({ where: { empresaId: empresa.id, periodo } });

  return NextResponse.json({ ok: true });
}
