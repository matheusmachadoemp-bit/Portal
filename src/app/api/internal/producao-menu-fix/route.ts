import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { MENU_CATEGORIES_TAG } from "@/lib/menu-categories";

// TEMPORARY, idempotent fix route. Delete after use.
// Cria a categoria "Produção" e suas 7 subcategorias, já que
// prisma/seed.ts não roda sozinho em produção.
const PRODUCAO_SUBS = [
  { key: "visao-geral", name: "Visão Geral", icon: "LayoutDashboard" },
  { key: "hoje", name: "Produção de Hoje", icon: "ClipboardList" },
  { key: "planejamento", name: "Planejamento", icon: "CalendarClock" },
  { key: "produtos", name: "Produtos de Produção", icon: "Beef" },
  { key: "historico", name: "Histórico", icon: "History" },
  { key: "indicadores", name: "Indicadores", icon: "BarChart3" },
  { key: "configuracoes", name: "Configurações", icon: "Settings" },
];

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results: { step: string; ok: boolean; error?: string }[] = [];

  try {
    const category = await prisma.category.upsert({
      where: { key: "producao" },
      update: { name: "Produção", icon: "ChefHat", contentType: "producao" },
      create: { key: "producao", name: "Produção", icon: "ChefHat", order: 17, contentType: "producao", isSystem: true },
    });
    let order = 0;
    for (const sub of PRODUCAO_SUBS) {
      await prisma.subcategory.upsert({
        where: { categoryId_key: { categoryId: category.id, key: sub.key } },
        update: { name: sub.name, icon: sub.icon, order },
        create: { categoryId: category.id, key: sub.key, name: sub.name, icon: sub.icon, order, isSystem: true },
      });
      order++;
    }
    results.push({ step: "categoria e subcategorias producao (upsert)", ok: true });
  } catch (err) {
    results.push({ step: "categoria producao", ok: false, error: String(err) });
  }

  revalidateTag(MENU_CATEGORIES_TAG, { expire: 0 });

  return NextResponse.json({ results });
}
