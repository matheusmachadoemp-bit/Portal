import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { MENU_CATEGORIES_TAG } from "@/lib/menu-categories";
import { ensureDefaultSubcategoryPermissions } from "@/lib/authz";

// body: { type: "category", items: [{id, order}] }
//     | { type: "subcategory", items: [{id, order, categoryId}] }
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json(
      { error: "Sem permissão para reordenar o menu." },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { type, items } = body as {
    type: "category" | "subcategory";
    items: { id: string; order: number; categoryId?: string }[];
  };

  if (type === "category") {
    await prisma.$transaction(
      items.map((item) =>
        prisma.category.update({ where: { id: item.id }, data: { order: item.order } })
      )
    );
  } else {
    const categoryIds = Array.from(
      new Set(items.map((item) => item.categoryId).filter((id): id is string => !!id))
    );
    if (categoryIds.length > 0) {
      const existingCategories = await prisma.category.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true },
      });
      if (existingCategories.length !== categoryIds.length) {
        return NextResponse.json(
          { error: "Uma ou mais categorias informadas não existem." },
          { status: 400 }
        );
      }
    }

    // Subcategorias que MUDAM de categoria: a permissão composta é `categoria:sub`, então a
    // chave nova não teria linha e a sub voltaria a herdar o acesso aberto da categoria de
    // destino (ver `ensureDefaultSubcategoryPermissions`). Resolvido ANTES de mover, pra gravar as
    // linhas restritas já com a chave nova. Só subcategorias criadas pelo usuário (`isSystem:
    // false`) — as de sistema (seed) seguem a herança de sempre.
    const movedItems = items.filter((item) => item.categoryId);
    const [currentSubs, targetCategories] = await Promise.all([
      prisma.subcategory.findMany({
        where: { id: { in: movedItems.map((i) => i.id) } },
        select: { id: true, key: true, categoryId: true, isSystem: true },
      }),
      prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, key: true } }),
    ]);
    const categoryKeyById = new Map(targetCategories.map((c) => [c.id, c.key]));
    for (const item of movedItems) {
      const sub = currentSubs.find((x) => x.id === item.id);
      if (!sub || sub.isSystem || sub.categoryId === item.categoryId) continue;
      await ensureDefaultSubcategoryPermissions(categoryKeyById.get(item.categoryId!)!, sub.key);
    }

    await prisma.$transaction(
      items.map((item) =>
        prisma.subcategory.update({
          where: { id: item.id },
          data: {
            order: item.order,
            ...(item.categoryId ? { categoryId: item.categoryId } : {}),
          },
        })
      )
    );
  }

  revalidateTag(MENU_CATEGORIES_TAG, { expire: 0 });
  return NextResponse.json({ ok: true });
}
