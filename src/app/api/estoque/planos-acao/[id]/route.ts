import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.actionPlan.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }

  const plan = await prisma.actionPlan.update({
    where: { id },
    data: {
      problema: body.problema ?? undefined,
      causaProvavel: body.causaProvavel !== undefined ? body.causaProvavel || null : undefined,
      acaoCorretiva: body.acaoCorretiva ?? undefined,
      responsavel: body.responsavel !== undefined ? body.responsavel || null : undefined,
      prazo: body.prazo !== undefined ? (body.prazo ? new Date(body.prazo) : null) : undefined,
      status: body.status ?? undefined,
      evidenciaUrl: body.evidenciaUrl !== undefined ? body.evidenciaUrl || null : undefined,
    },
  });
  return NextResponse.json({ plan });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.actionPlan.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  await prisma.actionPlan.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
