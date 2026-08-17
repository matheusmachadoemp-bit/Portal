import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { MENU_CATEGORIES_TAG } from "@/lib/menu-categories";

async function checkAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") return null;
  return session.user;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await checkAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

  const category = await prisma.category.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.icon !== undefined ? { icon: body.icon } : {}),
      ...(body.color !== undefined ? { color: body.color } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
    },
  });

  revalidateTag(MENU_CATEGORIES_TAG, { expire: 0 });
  return NextResponse.json({ category });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await checkAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const category = await prisma.category.findUnique({ where: { id } });
  if (category?.isSystem) {
    return NextResponse.json(
      { error: "Categorias padrão do sistema não podem ser excluídas, apenas desativadas." },
      { status: 400 }
    );
  }

  await prisma.category.delete({ where: { id } });
  revalidateTag(MENU_CATEGORIES_TAG, { expire: 0 });
  return NextResponse.json({ ok: true });
}
