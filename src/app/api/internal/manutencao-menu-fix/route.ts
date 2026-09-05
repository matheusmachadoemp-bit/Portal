import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { MENU_CATEGORIES_TAG } from "@/lib/menu-categories";

// TEMPORARY, idempotent fix route. Delete after use.
// Cria a categoria "Manutenção" e suas 7 subcategorias, já que
// prisma/seed.ts não roda sozinho em produção.
const MANUTENCAO_SUBS = [
  { key: "visao-geral", name: "Visão geral", icon: "LayoutDashboard" },
  { key: "chamados", name: "Chamados", icon: "ClipboardList" },
  { key: "equipamentos", name: "Equipamentos", icon: "Boxes" },
  { key: "calendario", name: "Calendário preventivo", icon: "CalendarClock" },
  { key: "prestadores", name: "Prestadores", icon: "Users" },
  { key: "relatorios", name: "Relatórios", icon: "FileSpreadsheet" },
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
      where: { key: "manutencao" },
      update: { name: "Manutenção", icon: "Wrench", contentType: "manutencao" },
      create: { key: "manutencao", name: "Manutenção", icon: "Wrench", order: 16, contentType: "manutencao", isSystem: true },
    });
    let order = 0;
    for (const sub of MANUTENCAO_SUBS) {
      await prisma.subcategory.upsert({
        where: { categoryId_key: { categoryId: category.id, key: sub.key } },
        update: { name: sub.name, icon: sub.icon, order },
        create: { categoryId: category.id, key: sub.key, name: sub.name, icon: sub.icon, order, isSystem: true },
      });
      order++;
    }
    results.push({ step: "categoria e subcategorias manutencao (upsert)", ok: true });
  } catch (err) {
    results.push({ step: "categoria manutencao", ok: false, error: String(err) });
  }

  revalidateTag(MENU_CATEGORIES_TAG, { expire: 0 });

  return NextResponse.json({ results });
}
