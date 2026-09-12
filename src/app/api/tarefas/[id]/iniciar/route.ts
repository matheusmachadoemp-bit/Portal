import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { logTaskHistory } from "@/lib/tarefas-server";
import { hasModulePermission } from "@/lib/authz";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const task = await prisma.task.findUnique({ where: { id }, include: { assignees: true } });
  if (!task) return NextResponse.json({ error: "Não encontrada." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, task.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  // Iniciar é o responsável executando a PRÓPRIA tarefa atribuída — diferente de "editar a
  // tarefa" (mudar título, prazo, responsáveis etc., uma ação de quem administra o módulo
  // Tarefas). Por isso libera também para quem está em `assignees`, mesmo sem canEdit no
  // módulo inteiro (um perfil "só executa" — ex.: Chef, Garçom — precisa continuar iniciando
  // as próprias tarefas). canEdit continua liberando por cima, pra quem administra o módulo
  // conseguir iniciar em nome de outra pessoa se precisar.
  const isAssignee = task.assignees.some((a) => a.userId === session.user.id);
  if (!isAssignee && !(await hasModulePermission(session.user.id, "tarefas", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite iniciar tarefas." },
      { status: 403 }
    );
  }
  if (task.status !== "PENDENTE") {
    return NextResponse.json({ error: "Essa tarefa já foi iniciada." }, { status: 400 });
  }

  const updated = await prisma.task.update({ where: { id }, data: { status: "EM_ANDAMENTO" } });
  await logTaskHistory(id, session.user.id, "STARTED");

  return NextResponse.json({ task: updated });
}
