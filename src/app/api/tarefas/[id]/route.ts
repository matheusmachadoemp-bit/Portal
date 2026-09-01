import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { logTaskHistory } from "@/lib/tarefas-server";

const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

const TASK_DETAIL_INCLUDE = {
  empresa: { select: { id: true, name: true, color: true } },
  createdBy: { select: { id: true, name: true } },
  validator: { select: { id: true, name: true } },
  assignees: { include: { user: { select: { id: true, name: true } } } },
  checklist: { orderBy: { order: "asc" as const } },
  comments: { orderBy: { createdAt: "asc" as const }, include: { author: { select: { id: true, name: true } } } },
  attachments: { orderBy: { createdAt: "asc" as const }, include: { uploadedBy: { select: { id: true, name: true } } } },
  proofs: { orderBy: { createdAt: "desc" as const }, include: { submittedBy: { select: { id: true, name: true } } } },
  validations: { orderBy: { createdAt: "desc" as const }, include: { validator: { select: { id: true, name: true } } } },
  history: { orderBy: { createdAt: "asc" as const }, include: { user: { select: { id: true, name: true } } } },
  recurrence: { select: { id: true, freq: true } },
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const task = await prisma.task.findUnique({ where: { id }, include: TASK_DETAIL_INCLUDE });
  if (!task) return NextResponse.json({ error: "Não encontrada." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, task.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }

  return NextResponse.json({
    task: { ...task, overdue: !!task.dueDate && task.status !== "CONCLUIDA" && task.dueDate.getTime() < Date.now() },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrada." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }

  const canManage = MANAGER_ROLES.includes(session.user.role) || existing.createdById === session.user.id;
  if (!canManage) {
    return NextResponse.json({ error: "Você não pode alterar prazo, responsável ou dados da tarefa." }, { status: 403 });
  }

  const body = await req.json();
  const changes: string[] = [];
  if (body.title !== undefined && body.title !== existing.title) changes.push("título");
  if (body.dueDate !== undefined) changes.push("prazo");
  if (body.assigneeIds !== undefined) changes.push("responsáveis");

  const task = await prisma.task.update({
    where: { id },
    data: {
      title: body.title ?? undefined,
      description: body.description !== undefined ? body.description || null : undefined,
      sectorKey: body.sectorKey ?? undefined,
      priority: body.priority ?? undefined,
      startDate: body.startDate !== undefined ? (body.startDate ? new Date(body.startDate) : null) : undefined,
      dueDate: body.dueDate !== undefined ? (body.dueDate ? new Date(body.dueDate) : null) : undefined,
      dueTime: body.dueTime !== undefined ? body.dueTime || null : undefined,
      proofType: body.proofType ?? undefined,
      requiresValidation: body.requiresValidation !== undefined ? !!body.requiresValidation : undefined,
      validatorId: body.validatorId !== undefined ? body.validatorId || null : undefined,
      ...(Array.isArray(body.assigneeIds)
        ? {
            assignees: {
              deleteMany: {},
              create: body.assigneeIds.map((userId: string) => ({ userId })),
            },
          }
        : {}),
    },
  });

  if (changes.length > 0) {
    await logTaskHistory(task.id, session.user.id, "STATUS_CHANGED", `Atualizou ${changes.join(", ")}`);
  }

  return NextResponse.json({ task });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrada." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  const canManage = MANAGER_ROLES.includes(session.user.role) || existing.createdById === session.user.id;
  if (!canManage) return NextResponse.json({ error: "Você não pode excluir essa tarefa." }, { status: 403 });

  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
