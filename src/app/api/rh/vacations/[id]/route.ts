import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.vacation.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  const body = await req.json();

  const vacation = await prisma.vacation.update({
    where: { id },
    data: {
      periodoAquisitivoInicio: body.periodoAquisitivoInicio ? new Date(body.periodoAquisitivoInicio) : undefined,
      periodoAquisitivoFim: body.periodoAquisitivoFim ? new Date(body.periodoAquisitivoFim) : undefined,
      diasDireito: body.diasDireito !== undefined ? Number(body.diasDireito) : undefined,
      dataInicio: body.dataInicio !== undefined ? (body.dataInicio ? new Date(body.dataInicio) : null) : undefined,
      dataFim: body.dataFim !== undefined ? (body.dataFim ? new Date(body.dataFim) : null) : undefined,
      dias: body.dias !== undefined ? (body.dias ? Number(body.dias) : null) : undefined,
      status: body.status ?? undefined,
      observacao: body.observacao ?? undefined,
    },
  });

  return NextResponse.json({ vacation });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.vacation.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  await prisma.vacation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
