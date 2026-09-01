import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { MENU_CATEGORIES_TAG } from "@/lib/menu-categories";

// TEMPORARY, ONE-OFF ROUTE. Desativar (active=false) a subcategoria
// "Dashboard" ainda a deixa visível no menu (só esmaecida) — o usuário
// pediu para ela sumir de vez. Exclui de fato essas 5 subcategorias
// (são "isSystem", por isso a rota normal de exclusão as bloqueia; aqui é
// intencional, a pedido do usuário). Protegida por sessão
// ADMINISTRADOR/GESTOR. Apagar depois de usar.

const TARGETS: { categoryKey: string; subKey: string }[] = [
  { categoryKey: "marketing", subKey: "dashboard" },
  { categoryKey: "universidade", subKey: "dashboard" },
  { categoryKey: "rh", subKey: "dashboard" },
  { categoryKey: "estoque", subKey: "dashboard" },
  { categoryKey: "crm", subKey: "dashboard" },
];

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const apply = searchParams.get("apply") === "1";

  const results: { categoria: string; subcategoria: string; encontrada: boolean }[] = [];

  for (const t of TARGETS) {
    const category = await prisma.category.findUnique({ where: { key: t.categoryKey } });
    if (!category) {
      results.push({ categoria: t.categoryKey, subcategoria: t.subKey, encontrada: false });
      continue;
    }
    const sub = await prisma.subcategory.findUnique({
      where: { categoryId_key: { categoryId: category.id, key: t.subKey } },
    });
    if (!sub) {
      results.push({ categoria: t.categoryKey, subcategoria: t.subKey, encontrada: false });
      continue;
    }
    results.push({ categoria: t.categoryKey, subcategoria: t.subKey, encontrada: true });
    if (apply) {
      await prisma.subcategory.delete({ where: { id: sub.id } });
    }
  }

  if (apply) revalidateTag(MENU_CATEGORIES_TAG, { expire: 0 });

  return NextResponse.json({ apply, resultados: results });
}
