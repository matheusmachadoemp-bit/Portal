import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  const body = await req.json();

  const employee = await prisma.employee.update({
    where: { id },
    data: {
      name: body.name ?? undefined,
      cargo: body.cargo ?? undefined,
      setor: body.setor ?? undefined,
      admissionDate: body.admissionDate ? new Date(body.admissionDate) : undefined,
      terminationDate: body.terminationDate ? new Date(body.terminationDate) : body.terminationDate === null ? null : undefined,
      status: body.status ?? undefined,
      phone: body.phone ?? undefined,
      email: body.email ?? undefined,
      cpf: body.cpf ?? undefined,
      birthDate: body.birthDate !== undefined ? (body.birthDate ? new Date(body.birthDate) : null) : undefined,
      escala: body.escala ?? undefined,
      gestorResponsavel: body.gestorResponsavel ?? undefined,
      supervisorResponsavel: body.supervisorResponsavel ?? undefined,
      salarioFixo: body.salarioFixo !== undefined ? (body.salarioFixo ? Number(body.salarioFixo) : null) : undefined,
      lastEvaluationDate:
        body.lastEvaluationDate !== undefined ? (body.lastEvaluationDate ? new Date(body.lastEvaluationDate) : null) : undefined,
      lastEvaluationNote: body.lastEvaluationNote ?? undefined,
      lastTrainingDate:
        body.lastTrainingDate !== undefined ? (body.lastTrainingDate ? new Date(body.lastTrainingDate) : null) : undefined,
      lastTrainingName: body.lastTrainingName ?? undefined,
    },
  });

  return NextResponse.json({ employee });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  await prisma.employee.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
