import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.goal.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  const body = await req.json();

  const goal = await prisma.goal.update({
    where: { id },
    data: {
      name: body.name ?? undefined,
      category: body.category ?? undefined,
      responsavel: body.responsavel ?? undefined,
      description: body.description ?? undefined,
      indicador: body.indicador ?? undefined,
      valorMeta: body.valorMeta !== undefined ? Number(body.valorMeta) : undefined,
      valorRealizado: body.valorRealizado !== undefined ? Number(body.valorRealizado) : undefined,
      unidade: body.unidade ?? undefined,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      bonificacao: body.bonificacao ?? undefined,
      status: body.status ?? undefined,
      observacoes: body.observacoes ?? undefined,
      planoDeAcao: body.planoDeAcao ?? undefined,
    },
  });

  return NextResponse.json({ goal });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.goal.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  await prisma.goal.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
