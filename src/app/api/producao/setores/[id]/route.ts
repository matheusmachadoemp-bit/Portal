import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { PRODUCTION_MANAGER_ROLES } from "@/lib/producao-server";
import { hasModulePermission } from "@/lib/authz";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!PRODUCTION_MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode editar setores de produção." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "producao", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar setores de produção." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const body = await req.json();
  const setor = await prisma.productionSetor.update({
    where: { id },
    data: {
      name: body.name ?? undefined,
      color: body.color ?? undefined,
      icon: body.icon ?? undefined,
      order: body.order ?? undefined,
      active: body.active ?? undefined,
    },
  });

  return NextResponse.json({ setor });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!PRODUCTION_MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode excluir setores de produção." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "producao", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir setores de produção." },
      { status: 403 }
    );
  }

  const { id } = await params;
  // Diferente de categorias (categoryId é OBRIGATÓRIO em ProductionItem — por isso a rota irmã
  // em producao/categorias/[id] bloqueia a exclusão quando há item vinculado, pra não deixar a
  // constraint do banco estourar um erro feio): aqui setorId é OPCIONAL e a FK já nasce como
  // ON DELETE SET NULL (ver migration 20261005180000). Excluir o setor é seguro — os itens
  // vinculados só voltam a ficar sem setor, sem erro de integridade pra tratar antes.
  await prisma.productionSetor.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
