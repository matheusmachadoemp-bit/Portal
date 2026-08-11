import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { computeHorasTrabalhadas } from "@/lib/rh-helpers";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.timeEntry.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  const body = await req.json();

  const entrada = body.entrada !== undefined ? body.entrada : existing.entrada;
  const saidaAlmoco = body.saidaAlmoco !== undefined ? body.saidaAlmoco : existing.saidaAlmoco;
  const retornoAlmoco = body.retornoAlmoco !== undefined ? body.retornoAlmoco : existing.retornoAlmoco;
  const saida = body.saida !== undefined ? body.saida : existing.saida;

  const entry = await prisma.timeEntry.update({
    where: { id },
    data: {
      date: body.date ? new Date(body.date) : undefined,
      entrada: body.entrada !== undefined ? body.entrada || null : undefined,
      saidaAlmoco: body.saidaAlmoco !== undefined ? body.saidaAlmoco || null : undefined,
      retornoAlmoco: body.retornoAlmoco !== undefined ? body.retornoAlmoco || null : undefined,
      saida: body.saida !== undefined ? body.saida || null : undefined,
      horasTrabalhadas: computeHorasTrabalhadas({ entrada, saidaAlmoco, retornoAlmoco, saida }),
      atrasoMinutos: body.atrasoMinutos !== undefined ? Number(body.atrasoMinutos) : undefined,
      falta: body.falta !== undefined ? !!body.falta : undefined,
    },
  });

  return NextResponse.json({ entry });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.timeEntry.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  await prisma.timeEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
