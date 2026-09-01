import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { MENU_CATEGORIES_TAG } from "@/lib/menu-categories";

// TEMPORARY, ONE-OFF ROUTE. As categorias Marketing, Universidade Grupo
// Nord, RH, Estoque e CRM passaram a mostrar o dashboard direto ao clicar
// na categoria (sem precisar entrar numa subcategoria "Dashboard"/"Visão
// Geral"). Essa rota desativa (não exclui — são subcategorias do sistema)
// esse item duplicado no menu lateral dessas 5 categorias.
// Protegida por sessão ADMINISTRADOR/GESTOR. Apagar depois de usar.

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

  const results: { categoria: string; subcategoria: string; encontrada: boolean; jaDesativada: boolean }[] = [];

  for (const t of TARGETS) {
    const category = await prisma.category.findUnique({ where: { key: t.categoryKey } });
    if (!category) {
      results.push({ categoria: t.categoryKey, subcategoria: t.subKey, encontrada: false, jaDesativada: false });
      continue;
    }
    const sub = await prisma.subcategory.findUnique({
      where: { categoryId_key: { categoryId: category.id, key: t.subKey } },
    });
    if (!sub) {
      results.push({ categoria: t.categoryKey, subcategoria: t.subKey, encontrada: false, jaDesativada: false });
      continue;
    }
    results.push({ categoria: t.categoryKey, subcategoria: t.subKey, encontrada: true, jaDesativada: !sub.active });
    if (apply && sub.active) {
      await prisma.subcategory.update({ where: { id: sub.id }, data: { active: false } });
    }
  }

  if (apply) revalidateTag(MENU_CATEGORIES_TAG, { expire: 0 });

  return NextResponse.json({ apply, resultados: results });
}
