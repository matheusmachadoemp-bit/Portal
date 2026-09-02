import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { MENU_CATEGORIES_TAG } from "@/lib/menu-categories";

// TEMPORARY, idempotent fix route. Delete after use.
// Re-syncs the Marketing sidebar subcategories (Category/Subcategory), which
// were only ever added via prisma/seed.ts — a script that never runs
// automatically in production — and busts the cached sidebar menu so the
// new "Parcerias" entry (and correct ordering) actually shows up.
const MARKETING_SUBS = [
  { key: "dashboard", name: "Dashboard", icon: "LayoutDashboard" },
  { key: "calendario", name: "Calendário de Conteúdo", icon: "Calendar" },
  { key: "tarefas", name: "Tarefas", icon: "ListChecks" },
  { key: "campanhas", name: "Campanhas", icon: "Megaphone" },
  { key: "parcerias", name: "Parcerias", icon: "Handshake" },
  { key: "biblioteca", name: "Biblioteca de Arquivos", icon: "FolderOpen" },
  { key: "ideias", name: "Banco de Ideias", icon: "Lightbulb" },
  { key: "trafego-pago", name: "Tráfego Pago", icon: "TrendingUp" },
  { key: "redes-sociais", name: "Redes Sociais", icon: "Share2" },
  { key: "equipe", name: "Equipe", icon: "Users" },
  { key: "relatorios", name: "Relatórios", icon: "FileSpreadsheet" },
];

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results: { step: string; ok: boolean; error?: string }[] = [];

  try {
    const category = await prisma.category.findUnique({ where: { key: "marketing" } });
    if (!category) {
      results.push({ step: "category marketing", ok: false, error: "categoria marketing não encontrada" });
    } else {
      let subOrder = 0;
      for (const sub of MARKETING_SUBS) {
        await prisma.subcategory.upsert({
          where: { categoryId_key: { categoryId: category.id, key: sub.key } },
          update: { name: sub.name, icon: sub.icon, order: subOrder },
          create: {
            categoryId: category.id,
            key: sub.key,
            name: sub.name,
            icon: sub.icon,
            order: subOrder,
            isSystem: true,
          },
        });
        subOrder++;
      }
      results.push({ step: "subcategorias marketing (upsert)", ok: true });
    }
  } catch (err) {
    results.push({ step: "subcategorias marketing", ok: false, error: String(err) });
  }

  revalidateTag(MENU_CATEGORIES_TAG, { expire: 0 });

  return NextResponse.json({ results });
}
