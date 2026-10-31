import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { MENU_CATEGORIES_TAG } from "@/lib/menu-categories";
import { ensureDefaultModulePermissions } from "@/lib/authz";
import { buildVisibilityResolver } from "@/lib/permissions";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [allCategories, dbUser] = await Promise.all([
    prisma.category.findMany({
      orderBy: { order: "asc" },
      include: { subcategories: { orderBy: { order: "asc" } } },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        permissionProfile: { select: { modulePermissions: { select: { moduleKey: true, canView: true } } } },
        permissions: { select: { moduleKey: true, level: true } },
      },
    }),
  ]);

  // Mesmo filtro de visibilidade aplicado ao menu lateral renderizado no servidor
  // (src/app/portal/layout.tsx) — sem isto, esta rota devolvia nome/ícone/cor/key de TODAS as
  // categorias/subcategorias pra qualquer usuário autenticado, independente de permissão (achado
  // de segurança #128: vazamento de metadado, já que o sidebar em si já filtra corretamente no
  // SSR; esta rota client-side é que estava crua).
  const isVisible = buildVisibilityResolver(
    session.user.role,
    dbUser?.permissionProfile?.modulePermissions,
    dbUser?.permissions
  );
  const categories = isVisible
    ? allCategories
        .filter((c) => isVisible(c.key))
        .map((c) => ({ ...c, subcategories: c.subcategories.filter((s) => isVisible(`${c.key}:${s.key}`)) }))
    : allCategories;

  return NextResponse.json({ categories });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  if (body.key !== undefined && body.key !== null && !/^[a-z0-9-]+$/.test(String(body.key))) {
    return NextResponse.json({ error: "Chave inválida (use apenas letras minúsculas, números e hífen)." }, { status: 400 });
  }
  const maxOrder = await prisma.category.aggregate({ _max: { order: true } });

  const category = await prisma.category.create({
    data: {
      key: body.key ?? `custom-${Date.now()}`,
      name: body.name ?? "Nova categoria",
      icon: body.icon ?? "LayoutGrid",
      color: body.color ?? "#1464F4",
      order: (maxOrder._max.order ?? 0) + 1,
      contentType: body.contentType ?? "custom",
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "CREATE",
      entityType: "Category",
      entityId: category.id,
      after: JSON.stringify(category),
    },
  });

  // Sem isto, a `key` nova (`custom-${Date.now()}`, nunca vista por nenhum ModulePermission)
  // deixaria até o próprio Gestor que acabou de criar sem conseguir ver a categoria — ver
  // comentário completo em `ensureDefaultModulePermissions` (@/lib/authz).
  await ensureDefaultModulePermissions(category.key);

  revalidateTag(MENU_CATEGORIES_TAG, { expire: 0 });
  return NextResponse.json({ category });
}
