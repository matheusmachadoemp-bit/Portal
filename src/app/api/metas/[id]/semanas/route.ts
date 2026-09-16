import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { weeksInGoalPeriod } from "@/lib/goals";
import { recomputeGoalRealizado } from "@/lib/goals-server";

/**
 * Lançamentos semanais de uma meta (ver comentário do model
 * `GoalWeeklyUpdate` em prisma/schema.prisma) — o "valor realizado" do mês
 * (`Goal.valorRealizado`) é sempre a soma destes lançamentos, nunca mais um
 * número digitado direto na meta.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "metas", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver o Metas." }, { status: 403 });
  }

  const { id } = await params;
  const goal = await prisma.goal.findUnique({ where: { id } });
  if (!goal) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, goal.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }

  const weeklyUpdates = await prisma.goalWeeklyUpdate.findMany({
    where: { goalId: id },
    orderBy: { weekNumber: "asc" },
  });

  return NextResponse.json({ weeklyUpdates, totalSemanas: weeksInGoalPeriod(goal.startDate, goal.endDate) });
}

/**
 * Cria OU atualiza (upsert) o lançamento de uma semana específica — lançar
 * de novo a mesma semana substitui o valor anterior dela (nunca soma dentro
 * da própria semana; quem soma é o conjunto das semanas entre si, via
 * `recomputeGoalRealizado`).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "metas", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite lançar atualizações semanais de metas." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const goal = await prisma.goal.findUnique({ where: { id } });
  if (!goal) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, goal.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }

  const body = await req.json();
  const weekNumber = Number(body.weekNumber);
  const totalSemanas = weeksInGoalPeriod(goal.startDate, goal.endDate);
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > totalSemanas) {
    return NextResponse.json(
      { error: `Informe uma semana válida (1 a ${totalSemanas} para o período desta meta).` },
      { status: 400 }
    );
  }

  const valor = Number(body.valor);
  if (Number.isNaN(valor)) {
    return NextResponse.json({ error: "Informe um valor numérico para a semana." }, { status: 400 });
  }

  await prisma.goalWeeklyUpdate.upsert({
    where: { goalId_weekNumber: { goalId: id, weekNumber } },
    create: {
      goalId: id,
      weekNumber,
      valor,
      observacao: body.observacao || null,
      createdById: session.user.id,
    },
    update: {
      valor,
      observacao: body.observacao || null,
    },
  });

  const updatedGoal = await recomputeGoalRealizado(id);

  return NextResponse.json({ goal: updatedGoal });
}
