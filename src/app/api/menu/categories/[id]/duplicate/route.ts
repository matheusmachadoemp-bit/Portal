import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { MENU_CATEGORIES_TAG } from "@/lib/menu-categories";
import { ensureDefaultModulePermissions, ensureDefaultSubcategoryPermissions } from "@/lib/authz";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const original = await prisma.category.findUnique({
    where: { id },
    include: { subcategories: true },
  });
  if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const maxOrder = await prisma.category.aggregate({ _max: { order: true } });

  // Chaves calculadas antes, pra gravar as permissões restritas ANTES de criar a cópia (nunca fica
  // uma cópia existente e aberta). A cópia tem `key` nova, fora de `MODULES`: sem estas linhas nem
  // o Gestor a veria, e as subcategorias herdariam acesso aberto.
  const stamp = Date.now();
  const copyKey = `${original.key}-copy-${stamp}`;
  const subKeyFor = (key: string) => `${key}-copy-${stamp}`;
  await ensureDefaultModulePermissions(copyKey);
  await Promise.all(original.subcategories.map((s) => ensureDefaultSubcategoryPermissions(copyKey, subKeyFor(s.key))));

  const copy = await prisma.category.create({
    data: {
      key: copyKey,
      name: `${original.name} (cópia)`,
      icon: original.icon,
      color: original.color,
      order: (maxOrder._max.order ?? 0) + 1,
      contentType: original.contentType,
      isSystem: false,
      subcategories: {
        create: original.subcategories.map((s) => ({
          key: subKeyFor(s.key),
          name: s.name,
          icon: s.icon,
          color: s.color,
          order: s.order,
          isSystem: false,
        })),
      },
    },
  });

  revalidateTag(MENU_CATEGORIES_TAG, { expire: 0 });
  return NextResponse.json({ category: copy });
}
