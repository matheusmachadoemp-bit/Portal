import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { computeGoalStatus, GERENCIA_RESPONSAVEL, weeksInGoalPeriod } from "@/lib/goals";
import { hasModulePermission } from "@/lib/authz";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.goal.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "metas", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar metas." },
      { status: 403 }
    );
  }
  const body = await req.json();

  const valorMeta = body.valorMeta !== undefined ? Number(body.valorMeta) : existing.valorMeta;
  // `valorRealizado` nunca é aceito aqui (mesmo que o body envie um) — é
  // sempre um cache da soma dos lançamentos semanais (ver
  // src/app/api/metas/[id]/semanas/route.ts e recomputeGoalRealizado em
  // src/lib/goals-server.ts), nunca editado direto na definição da meta.
  const valorRealizado = existing.valorRealizado;
  const startDate = body.startDate ? new Date(body.startDate) : existing.startDate;
  const endDate = body.endDate ? new Date(body.endDate) : existing.endDate;

  // Mudar o período (mês) de uma meta que já tem lançamentos semanais pode
  // "sobrar" semana: ex. reduzir de um mês de 31 dias (5 semanas) para um de
  // 28 dias (4 semanas) enquanto já existe um lançamento na semana 5 deixaria
  // um GoalWeeklyUpdate órfão, fora do novo período. Em vez de apagar dado
  // silenciosamente, bloqueia a edição e pede pra resolver a semana antes.
  if (body.startDate !== undefined || body.endDate !== undefined) {
    const novoTotalSemanas = weeksInGoalPeriod(startDate, endDate);
    const semanaForaDoPeriodo = await prisma.goalWeeklyUpdate.findFirst({
      where: { goalId: id, weekNumber: { gt: novoTotalSemanas } },
    });
    if (semanaForaDoPeriodo) {
      return NextResponse.json(
        {
          error: `Não é possível mudar o período: já existe um lançamento na semana ${semanaForaDoPeriodo.weekNumber}, que ficaria fora do novo período (só ${novoTotalSemanas} semana(s)). Exclua ou ajuste esse lançamento antes de mudar o período da meta.`,
        },
        { status: 400 }
      );
    }
  }

  // Metas > Gerência: "responsável" é sempre GERENCIA_RESPONSAVEL, nunca o
  // texto que vier no body — mesma regra e mesmo motivo do POST
  // /api/metas (ver comentário lá). Usa a categoria resultante desta edição
  // (a nova, se enviada; senão a que a meta já tinha), não só `body.category`,
  // para cobrir tanto uma meta que já é de Gerência quanto uma que está
  // sendo movida para Gerência agora.
  const category = body.category ?? existing.category;
  const responsavel = category === "GERENCIA" ? GERENCIA_RESPONSAVEL : (body.responsavel ?? undefined);

  const goal = await prisma.goal.update({
    where: { id },
    data: {
      name: body.name ?? undefined,
      category: body.category ?? undefined,
      responsavel,
      description: body.description ?? undefined,
      indicador: body.indicador ?? undefined,
      valorMeta,
      unidade: body.unidade ?? undefined,
      startDate: body.startDate ? startDate : undefined,
      endDate,
      bonificacao: body.bonificacao ?? undefined,
      status: computeGoalStatus(valorRealizado, valorMeta, endDate) as never,
      observacoes: body.observacoes ?? undefined,
      planoDeAcao: body.planoDeAcao ?? undefined,
    },
    include: { attachments: true, weeklyUpdates: { orderBy: { weekNumber: "asc" } } },
  });

  return NextResponse.json({ goal });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.goal.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "metas", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir metas." },
      { status: 403 }
    );
  }
  await prisma.goal.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
