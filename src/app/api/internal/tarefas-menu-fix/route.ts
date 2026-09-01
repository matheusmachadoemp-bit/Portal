import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { MENU_CATEGORIES_TAG } from "@/lib/menu-categories";

// TEMPORARY, idempotent fix route. Delete after use.
// Cria a categoria "Tarefas" no menu lateral (Category, sem subcategorias —
// igual ao padrão da CMV, que abre direto em /portal/tarefas).
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.category.findUnique({ where: { key: "tarefas" } });
  if (existing) {
    revalidateTag(MENU_CATEGORIES_TAG, { expire: 0 });
    return NextResponse.json({ ok: true, alreadyExists: true, category: existing });
  }

  const maxOrder = await prisma.category.aggregate({ _max: { order: true } });
  const category = await prisma.category.create({
    data: {
      key: "tarefas",
      name: "Tarefas",
      icon: "CheckCircle2",
      color: "#2952E3",
      order: (maxOrder._max.order ?? 0) + 1,
      isSystem: true,
      contentType: "custom",
    },
  });

  revalidateTag(MENU_CATEGORIES_TAG, { expire: 0 });

  return NextResponse.json({ ok: true, created: true, category });
}
