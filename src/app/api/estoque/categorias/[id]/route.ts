import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";

const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "estoque", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar categorias de estoque." },
      { status: 403 }
    );
  }
  const { id } = await params;
  const body = await req.json();

  const category = await prisma.stockCategory.update({
    where: { id },
    data: {
      name: body.name ?? undefined,
      color: body.color ?? undefined,
      icon: body.icon ?? undefined,
      setor: body.setor !== undefined ? body.setor || null : undefined,
      order: body.order !== undefined ? Number(body.order) : undefined,
      metaPerdaPercent: body.metaPerdaPercent !== undefined ? Number(body.metaPerdaPercent) : undefined,
      periodicidadeContagem: body.periodicidadeContagem ?? undefined,
      active: body.active !== undefined ? !!body.active : undefined,
    },
  });
  return NextResponse.json({ category });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "estoque", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir categorias de estoque." },
      { status: 403 }
    );
  }
  const { id } = await params;

  const inUse = await prisma.ingredient.count({ where: { categoryId: id } });
  if (inUse > 0) {
    return NextResponse.json({ error: "Existem produtos vinculados a esta categoria. Remova o vínculo antes de excluir." }, { status: 400 });
  }
  await prisma.stockCategory.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
