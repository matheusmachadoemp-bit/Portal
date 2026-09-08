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
  const existing = await prisma.occurrence.findUnique({ where: { id }, include: { employee: true } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.employee.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar ocorrências." },
      { status: 403 }
    );
  }
  const body = await req.json();

  const occurrence = await prisma.occurrence.update({
    where: { id },
    data: {
      date: body.date ? new Date(body.date) : undefined,
      type: body.type ?? undefined,
      horarioPrevisto: body.horarioPrevisto ?? undefined,
      horarioRealizado: body.horarioRealizado ?? undefined,
      minutosAtraso: body.minutosAtraso !== undefined ? Number(body.minutosAtraso) : undefined,
      justificativa: body.justificativa ?? undefined,
      medidasTomadas: body.medidasTomadas ?? undefined,
      prazo: body.prazo ? new Date(body.prazo) : body.prazo === null ? null : undefined,
      anexoUrl: body.anexoUrl ?? undefined,
      observacao: body.observacao ?? undefined,
      status: body.status ?? undefined,
    },
  });

  return NextResponse.json({ occurrence });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.occurrence.findUnique({ where: { id }, include: { employee: true } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.employee.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir ocorrências." },
      { status: 403 }
    );
  }
  await prisma.occurrence.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
