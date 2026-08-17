import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { MENU_CATEGORIES_TAG } from "@/lib/menu-categories";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const maxOrder = await prisma.subcategory.aggregate({
    where: { categoryId: body.categoryId },
    _max: { order: true },
  });

  const subcategory = await prisma.subcategory.create({
    data: {
      categoryId: body.categoryId,
      key: body.key ?? `sub-${Date.now()}`,
      name: body.name ?? "Nova subcategoria",
      icon: body.icon ?? "Folder",
      color: body.color ?? "#1464F4",
      order: (maxOrder._max.order ?? 0) + 1,
    },
  });

  revalidateTag(MENU_CATEGORIES_TAG, { expire: 0 });
  return NextResponse.json({ subcategory });
}
