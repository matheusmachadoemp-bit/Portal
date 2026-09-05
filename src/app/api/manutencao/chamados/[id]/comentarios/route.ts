import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { logChamadoHistorico } from "@/lib/manutencao-server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const chamado = await prisma.chamado.findUnique({ where: { id } });
  if (!chamado) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, chamado.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }

  const body = await req.json();
  if (!body.text || !String(body.text).trim()) {
    return NextResponse.json({ error: "Comentário vazio." }, { status: 400 });
  }

  const comentario = await prisma.chamadoComentario.create({
    data: { chamadoId: id, authorId: session.user.id, text: body.text },
    include: { author: { select: { id: true, name: true } } },
  });
  await logChamadoHistorico(id, session.user.id, "COMMENTED");

  return NextResponse.json({ comentario });
}
