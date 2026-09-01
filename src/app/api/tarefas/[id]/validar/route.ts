import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { logTaskHistory, notifyUser } from "@/lib/tarefas-server";

const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    include: { assignees: true, proofs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!task) return NextResponse.json({ error: "Não encontrada." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, task.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (task.status !== "AGUARDANDO_VALIDACAO") {
    return NextResponse.json({ error: "Essa tarefa não está aguardando validação." }, { status: 400 });
  }
  const canValidate = task.validatorId === session.user.id || MANAGER_ROLES.includes(session.user.role);
  if (!canValidate) {
    return NextResponse.json({ error: "Você não é o responsável pela validação desta tarefa." }, { status: 403 });
  }

  const body = await req.json();
  const approved = !!body.approved;
  const reason: string | null = body.reason || null;
  if (!approved && !reason) {
    return NextResponse.json({ error: "Informe o motivo da reprovação." }, { status: 400 });
  }

  const proofId = task.proofs[0]?.id ?? null;
  await prisma.taskValidation.create({
    data: { taskId: id, proofId, validatorId: session.user.id, approved, reason },
  });

  const updated = await prisma.task.update({
    where: { id },
    data: approved ? { status: "CONCLUIDA", completedAt: new Date() } : { status: "EM_ANDAMENTO" },
  });

  await logTaskHistory(id, session.user.id, approved ? "APPROVED" : "REJECTED", reason);
  if (approved) await logTaskHistory(id, session.user.id, "COMPLETED");

  for (const assignee of task.assignees) {
    if (assignee.userId === session.user.id) continue;
    await notifyUser(
      assignee.userId,
      approved ? "CONCLUIDA" : "REPROVADA",
      approved ? "Tarefa concluída" : "Tarefa reprovada",
      approved
        ? `A tarefa "${task.title}" foi aprovada e concluída.`
        : `A tarefa "${task.title}" foi devolvida para correção. Motivo: ${reason}`,
      id
    );
  }

  return NextResponse.json({ task: updated });
}
