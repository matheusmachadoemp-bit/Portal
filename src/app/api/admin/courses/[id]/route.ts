import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { encryptSecret } from "@/lib/vault";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json(
      { error: "Sem permissão para editar cursos." },
      { status: 403 }
    );
  }
  const { id } = await params;
  const body = await req.json();

  const data: Record<string, unknown> = {
    name: body.name ?? undefined,
    plataforma: body.plataforma ?? undefined,
    link: body.link ?? undefined,
    usuario: body.usuario ?? undefined,
    responsavel: body.responsavel ?? undefined,
    percentualConcluido: body.percentualConcluido !== undefined ? Number(body.percentualConcluido) : undefined,
    startDate: body.startDate ? new Date(body.startDate) : undefined,
    prazo: body.prazo ? new Date(body.prazo) : undefined,
    certificadoUrl: body.certificadoUrl ?? undefined,
    observacoes: body.observacoes ?? undefined,
  };
  // Só mexe na senha se um valor novo foi realmente enviado no body — do
  // contrário mantém intacto o que já está gravado (mesmo padrão do PATCH
  // do Cofre em admin/vault/[id]/route.ts).
  if (body.senha) data.senhaCipher = encryptSecret(body.senha);

  const course = await prisma.course.update({ where: { id }, data });

  // Mesmo cuidado do GET/POST: não devolve senhaCipher na resposta.
  const { senhaCipher, ...sanitizedCourse } = course;
  return NextResponse.json({ course: { ...sanitizedCourse, hasSenha: !!senhaCipher } });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json(
      { error: "Sem permissão para excluir cursos." },
      { status: 403 }
    );
  }
  const { id } = await params;
  await prisma.course.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
