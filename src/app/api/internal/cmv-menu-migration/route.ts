import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { MENU_CATEGORIES_TAG } from "@/lib/menu-categories";

// TEMPORARY, idempotent fix route. Delete after use.
// - Remove a subcategoria "Fichas Técnicas" de Estoque (virou o card "CMV
//   médio do cardápio" na categoria Ficha Técnica).
// - Move "CMV Teórico", "CMV Real" e "Comparativo Real x Teórico" de
//   Estoque para a categoria CMV.
const CMV_SUBS = [
  { key: "cmv-teorico", name: "CMV Teórico", icon: "Calculator" },
  { key: "cmv-real", name: "CMV Real", icon: "Warehouse" },
  { key: "comparativo", name: "Comparativo Real x Teórico", icon: "GitCompareArrows" },
];

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results: { step: string; ok: boolean; detail?: unknown; error?: string }[] = [];

  const estoqueCategory = await prisma.category.findUnique({ where: { key: "estoque" } });
  const cmvCategory = await prisma.category.findUnique({ where: { key: "cmv" } });

  if (!estoqueCategory || !cmvCategory) {
    return NextResponse.json({ error: "Categoria estoque ou cmv não encontrada." }, { status: 404 });
  }

  try {
    const deleted = await prisma.subcategory.deleteMany({
      where: { categoryId: estoqueCategory.id, key: { in: ["fichas-tecnicas", "cmv-teorico", "cmv-real", "comparativo"] } },
    });
    results.push({ step: "remover subcategorias antigas de estoque", ok: true, detail: deleted });
  } catch (err) {
    results.push({ step: "remover subcategorias antigas de estoque", ok: false, error: String(err) });
  }

  try {
    const maxOrder = await prisma.subcategory.aggregate({ where: { categoryId: cmvCategory.id }, _max: { order: true } });
    let order = maxOrder._max.order ?? -1;
    const created = [];
    for (const sub of CMV_SUBS) {
      order++;
      const row = await prisma.subcategory.upsert({
        where: { categoryId_key: { categoryId: cmvCategory.id, key: sub.key } },
        update: { name: sub.name, icon: sub.icon },
        create: { categoryId: cmvCategory.id, key: sub.key, name: sub.name, icon: sub.icon, order, isSystem: true },
      });
      created.push(row);
    }
    results.push({ step: "criar subcategorias em cmv (upsert)", ok: true, detail: created });
  } catch (err) {
    results.push({ step: "criar subcategorias em cmv", ok: false, error: String(err) });
  }

  revalidateTag(MENU_CATEGORIES_TAG, { expire: 0 });

  return NextResponse.json({ results });
}
