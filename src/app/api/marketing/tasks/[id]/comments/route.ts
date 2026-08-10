import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const task = await prisma.marketingTask.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, task.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  const body = await req.json();
  if (!body.text || !String(body.text).trim()) {
    return NextResponse.json({ error: "Comentário vazio." }, { status: 400 });
  }
  const comment = await prisma.marketingComment.create({
    data: { taskId: id, authorId: session.user.id, text: body.text },
    include: { author: { select: { name: true } } },
  });
  return NextResponse.json({ comment });
}
