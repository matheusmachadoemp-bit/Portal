import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const course = await prisma.course.update({
    where: { id },
    data: {
      name: body.name ?? undefined,
      plataforma: body.plataforma ?? undefined,
      link: body.link ?? undefined,
      usuario: body.usuario ?? undefined,
      senha: body.senha ?? undefined,
      responsavel: body.responsavel ?? undefined,
      percentualConcluido: body.percentualConcluido !== undefined ? Number(body.percentualConcluido) : undefined,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      prazo: body.prazo ? new Date(body.prazo) : undefined,
      certificadoUrl: body.certificadoUrl ?? undefined,
      observacoes: body.observacoes ?? undefined,
    },
  });

  return NextResponse.json({ course });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.course.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
