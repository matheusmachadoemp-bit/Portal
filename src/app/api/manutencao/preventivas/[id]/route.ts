import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { MANAGER_ROLES } from "@/lib/manutencao-server";
import { hasModulePermission } from "@/lib/authz";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode editar manutenções preventivas." }, { status: 403 });
  }
  const { id } = await params;

  const existing = await prisma.manutencaoPreventiva.findUnique({ where: { id }, include: { equipamento: true } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.equipamento.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "manutencao", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar manutenções preventivas." },
      { status: 403 }
    );
  }

  const body = await req.json();
  const preventiva = await prisma.manutencaoPreventiva.update({
    where: { id },
    data: {
      tipoServico: body.tipoServico ?? undefined,
      descricao: body.descricao !== undefined ? body.descricao || null : undefined,
      frequencia: body.frequencia ?? undefined,
      intervaloDiasCustom: body.intervaloDiasCustom !== undefined ? (body.intervaloDiasCustom ? Number(body.intervaloDiasCustom) : null) : undefined,
      horario: body.horario !== undefined ? body.horario || null : undefined,
      responsavelId: body.responsavelId !== undefined ? body.responsavelId || null : undefined,
      prestadorId: body.prestadorId !== undefined ? body.prestadorId || null : undefined,
      custoPrevisto: body.custoPrevisto !== undefined ? (body.custoPrevisto ? Number(body.custoPrevisto) : null) : undefined,
      checklist: body.checklist !== undefined ? (Array.isArray(body.checklist) && body.checklist.length > 0 ? JSON.stringify(body.checklist) : null) : undefined,
      necessidadeParada: body.necessidadeParada !== undefined ? !!body.necessidadeParada : undefined,
      active: body.active !== undefined ? !!body.active : undefined,
    },
  });

  return NextResponse.json({ preventiva });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode excluir manutenções preventivas." }, { status: 403 });
  }
  const { id } = await params;

  const existing = await prisma.manutencaoPreventiva.findUnique({ where: { id }, include: { equipamento: true } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.equipamento.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "manutencao", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir manutenções preventivas." },
      { status: 403 }
    );
  }

  await prisma.manutencaoPreventiva.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
