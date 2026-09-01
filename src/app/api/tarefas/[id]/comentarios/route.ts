import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { logTaskHistory } from "@/lib/tarefas-server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "Não encontrada." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, task.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }

  const body = await req.json();
  if (!body.text || !String(body.text).trim()) {
    return NextResponse.json({ error: "Escreva um comentário." }, { status: 400 });
  }

  const comment = await prisma.taskComment.create({
    data: { taskId: id, authorId: session.user.id, text: body.text },
    include: { author: { select: { id: true, name: true } } },
  });

  await logTaskHistory(id, session.user.id, "COMMENTED");

  return NextResponse.json({ comment });
}
