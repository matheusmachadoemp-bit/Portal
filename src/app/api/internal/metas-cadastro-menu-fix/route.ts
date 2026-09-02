import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { MENU_CATEGORIES_TAG } from "@/lib/menu-categories";

// TEMPORARY, idempotent fix route. Delete after use.
// Cria a subcategoria "Cadastrar Metas" (menu lateral > Metas), onde é
// possível criar/editar metas escolhendo o setor no próprio formulário.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const category = await prisma.category.findUnique({ where: { key: "metas" } });
  if (!category) {
    return NextResponse.json({ error: 'Categoria "metas" não encontrada.' }, { status: 404 });
  }

  const existing = await prisma.subcategory.findUnique({
    where: { categoryId_key: { categoryId: category.id, key: "cadastro" } },
  });
  if (existing) {
    revalidateTag(MENU_CATEGORIES_TAG, { expire: 0 });
    return NextResponse.json({ ok: true, alreadyExists: true, subcategory: existing });
  }

  const maxOrder = await prisma.subcategory.aggregate({ where: { categoryId: category.id }, _max: { order: true } });
  const subcategory = await prisma.subcategory.create({
    data: {
      categoryId: category.id,
      key: "cadastro",
      name: "Cadastrar Metas",
      icon: "ListPlus",
      order: (maxOrder._max.order ?? 0) + 1,
      isSystem: true,
    },
  });

  revalidateTag(MENU_CATEGORIES_TAG, { expire: 0 });

  return NextResponse.json({ ok: true, created: true, subcategory });
}
