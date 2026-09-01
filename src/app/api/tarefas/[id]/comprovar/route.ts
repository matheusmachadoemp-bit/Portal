import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { logTaskHistory, notifyUser } from "@/lib/tarefas-server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const task = await prisma.task.findUnique({ where: { id }, include: { checklist: true } });
  if (!task) return NextResponse.json({ error: "Não encontrada." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, task.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (task.status === "CONCLUIDA") {
    return NextResponse.json({ error: "Essa tarefa já está concluída." }, { status: 400 });
  }
  if (task.checklist.length > 0 && task.checklist.some((i) => !i.done)) {
    return NextResponse.json({ error: "Conclua todos os itens do checklist antes de enviar a comprovação." }, { status: 400 });
  }

  const body = await req.json();
  const text: string | null = body.text || null;
  const fileUrl: string | null = body.fileUrl || null;
  const mimeType: string | null = body.mimeType || null;

  if (task.proofType !== "NENHUMA") {
    const needsFile = task.proofType === "FOTO" || task.proofType === "ARQUIVO" || task.proofType === "FOTO_TEXTO";
    const needsText = task.proofType === "TEXTO" || task.proofType === "FOTO_TEXTO";
    if (needsFile && !fileUrl) return NextResponse.json({ error: "Envie o arquivo/foto exigido para comprovar." }, { status: 400 });
    if (needsText && !text) return NextResponse.json({ error: "Escreva o comentário de comprovação exigido." }, { status: 400 });
  }

  const proof = await prisma.taskProof.create({
    data: { taskId: id, submittedById: session.user.id, text, fileUrl, mimeType },
  });

  await logTaskHistory(id, session.user.id, "PROOF_SUBMITTED");

  let updated;
  if (task.requiresValidation && task.validatorId) {
    updated = await prisma.task.update({ where: { id }, data: { status: "AGUARDANDO_VALIDACAO" } });
    await notifyUser(
      task.validatorId,
      "AGUARDANDO_VALIDACAO",
      "Tarefa aguardando validação",
      `A tarefa "${task.title}" foi comprovada e aguarda sua validação.`,
      id
    );
  } else {
    updated = await prisma.task.update({ where: { id }, data: { status: "CONCLUIDA", completedAt: new Date() } });
    await logTaskHistory(id, session.user.id, "COMPLETED");
    if (task.createdById !== session.user.id) {
      await notifyUser(task.createdById, "CONCLUIDA", "Tarefa concluída", `A tarefa "${task.title}" foi concluída.`, id);
    }
  }

  return NextResponse.json({ task: updated, proof });
}
