import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { MENU_CATEGORIES_TAG } from "@/lib/menu-categories";
import { ensureDefaultModulePermissions, ensureDefaultSubcategoryPermissions } from "@/lib/authz";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  // A `key` vira segmento de URL e parte da chave de permissão composta (`categoria:sub`) — só
  // letras minúsculas, números e hífen (a UI nunca envia `key`; isto protege chamadas diretas).
  if (body.key !== undefined && !/^[a-z0-9-]+$/.test(String(body.key))) {
    return NextResponse.json({ error: "Chave inválida (use apenas letras minúsculas, números e hífen)." }, { status: 400 });
  }

  // Busca a categoria mãe antes de criar (em vez de deixar a FK constraint do
  // `prisma.subcategory.create` abaixo estourar um 500 pra um `categoryId` inválido): precisamos
  // da `key` dela de qualquer forma, pra `ensureDefaultModulePermissions` logo abaixo.
  const category = await prisma.category.findUnique({ where: { id: body.categoryId } });
  if (!category) {
    return NextResponse.json({ error: "Categoria não encontrada." }, { status: 400 });
  }

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

  // Uma subcategoria nova sem override próprio herda a visibilidade da CATEGORIA inteira (ver
  // buildVisibilityResolver/hasModulePermission) — então o que precisa de uma linha de
  // ModulePermission garantida é a `key` da categoria mãe, não uma chave composta. Idempotente
  // (upsert) e inofensivo pra uma categoria já conhecida (ex.: "financeiro": todo perfil já tem
  // linha própria desde o seed, então isto não faz nada) — só tem efeito de verdade pra uma
  // categoria criada pela própria sidebar, cuja `key` nunca existiu em `MODULES`. Ver comentário
  // completo em `ensureDefaultModulePermissions` (@/lib/authz).
  await ensureDefaultModulePermissions(category.key);
  // E a própria subcategoria nasce restrita (só Administrador/Gestor) em vez de herdar o acesso
  // aberto da categoria — ver `ensureDefaultSubcategoryPermissions` (@/lib/authz).
  await ensureDefaultSubcategoryPermissions(category.key, subcategory.key);

  revalidateTag(MENU_CATEGORIES_TAG, { expire: 0 });
  return NextResponse.json({ subcategory });
}
