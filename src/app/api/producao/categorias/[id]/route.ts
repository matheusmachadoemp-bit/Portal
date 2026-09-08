import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { PRODUCTION_MANAGER_ROLES } from "@/lib/producao-server";
import { hasModulePermission } from "@/lib/authz";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!PRODUCTION_MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode editar categorias de produção." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "producao", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar categorias de produção." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const body = await req.json();
  const categoria = await prisma.productionCategory.update({
    where: { id },
    data: {
      name: body.name ?? undefined,
      color: body.color ?? undefined,
      icon: body.icon ?? undefined,
      order: body.order ?? undefined,
      active: body.active ?? undefined,
    },
  });

  return NextResponse.json({ categoria });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!PRODUCTION_MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode excluir categorias de produção." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "producao", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir categorias de produção." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const itensVinculados = await prisma.productionItem.count({ where: { categoryId: id } });
  if (itensVinculados > 0) {
    return NextResponse.json(
      { error: "Existem produtos de produção nessa categoria. Mova-os antes de excluir." },
      { status: 400 }
    );
  }

  await prisma.productionCategory.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
