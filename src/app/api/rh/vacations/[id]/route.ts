import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.vacation.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar férias." },
      { status: 403 }
    );
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
  if (!(await hasModulePermission(session.user.id, "rh", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir férias." },
      { status: 403 }
    );
  }
  await prisma.vacation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
