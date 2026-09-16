import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { recomputeGoalRealizado } from "@/lib/goals-server";

/**
 * Corrige um lançamento semanal já existente por `id` (em vez de por
 * `weekNumber`, como o upsert de POST /api/metas/[id]/semanas) — usado
 * quando a tela precisa editar/apagar uma linha específica do histórico.
 * Nunca troca `weekNumber` de lugar (isso seria o mesmo que mover o
 * lançamento pra outra semana); só `valor`/`observacao`.
 */
async function loadWeeklyUpdate(goalId: string, weekId: string) {
  const weeklyUpdate = await prisma.goalWeeklyUpdate.findUnique({ where: { id: weekId } });
  if (!weeklyUpdate || weeklyUpdate.goalId !== goalId) return null;
  return weeklyUpdate;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; weekId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "metas", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar atualizações semanais de metas." },
      { status: 403 }
    );
  }

  const { id, weekId } = await params;
  const goal = await prisma.goal.findUnique({ where: { id } });
  if (!goal) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, goal.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }

  const weeklyUpdate = await loadWeeklyUpdate(id, weekId);
  if (!weeklyUpdate) return NextResponse.json({ error: "Lançamento semanal não encontrado." }, { status: 404 });

  const body = await req.json();
  const data: { valor?: number; observacao?: string | null } = {};
  if (body.valor !== undefined) {
    const valor = Number(body.valor);
    if (Number.isNaN(valor)) return NextResponse.json({ error: "Informe um valor numérico para a semana." }, { status: 400 });
    data.valor = valor;
  }
  if (body.observacao !== undefined) {
    data.observacao = body.observacao || null;
  }

  if (Object.keys(data).length > 0) {
    await prisma.goalWeeklyUpdate.update({ where: { id: weekId }, data });
  }

  const updatedGoal = await recomputeGoalRealizado(id);

  return NextResponse.json({ goal: updatedGoal });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; weekId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "metas", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir atualizações semanais de metas." },
      { status: 403 }
    );
  }

  const { id, weekId } = await params;
  const goal = await prisma.goal.findUnique({ where: { id } });
  if (!goal) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, goal.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }

  const weeklyUpdate = await loadWeeklyUpdate(id, weekId);
  if (!weeklyUpdate) return NextResponse.json({ error: "Lançamento semanal não encontrado." }, { status: 404 });

  await prisma.goalWeeklyUpdate.delete({ where: { id: weekId } });

  const updatedGoal = await recomputeGoalRealizado(id);

  return NextResponse.json({ goal: updatedGoal });
}
