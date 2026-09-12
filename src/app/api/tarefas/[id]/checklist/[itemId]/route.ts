import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { logTaskHistory } from "@/lib/tarefas-server";
import { hasModulePermission } from "@/lib/authz";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, itemId } = await params;

  const task = await prisma.task.findUnique({ where: { id }, include: { assignees: true } });
  if (!task) return NextResponse.json({ error: "Não encontrada." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, task.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  // Marcar/desmarcar um item do checklist é o responsável executando a PRÓPRIA tarefa
  // atribuída — diferente de "editar a tarefa". Libera também para quem está em
  // `assignees`, mesmo sem canEdit no módulo inteiro (um perfil "só executa" — ex.: Chef,
  // Garçom — precisa continuar riscando os itens da própria tarefa).
  const isAssignee = task.assignees.some((a) => a.userId === session.user.id);
  if (!isAssignee && !(await hasModulePermission(session.user.id, "tarefas", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite atualizar itens do checklist da tarefa." },
      { status: 403 }
    );
  }

  const existingItem = await prisma.taskChecklistItem.findUnique({ where: { id: itemId } });
  if (!existingItem || existingItem.taskId !== id) {
    return NextResponse.json({ error: "Item não encontrado nesta tarefa." }, { status: 404 });
  }

  const body = await req.json();
  const done = !!body.done;

  const item = await prisma.taskChecklistItem.update({
    where: { id: itemId },
    data: { done, doneAt: done ? new Date() : null, doneById: done ? session.user.id : null },
  });

  await logTaskHistory(id, session.user.id, done ? "CHECKLIST_ITEM_DONE" : "CHECKLIST_ITEM_REOPENED", item.text);

  return NextResponse.json({ item });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, itemId } = await params;

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "Não encontrada." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, task.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "tarefas", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite remover itens do checklist da tarefa." },
      { status: 403 }
    );
  }

  const existingItem = await prisma.taskChecklistItem.findUnique({ where: { id: itemId } });
  if (!existingItem || existingItem.taskId !== id) {
    return NextResponse.json({ error: "Item não encontrado nesta tarefa." }, { status: 404 });
  }

  await prisma.taskChecklistItem.delete({ where: { id: itemId } });
  return NextResponse.json({ ok: true });
}
