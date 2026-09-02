import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { MENU_CATEGORIES_TAG } from "@/lib/menu-categories";

// TEMPORARY, idempotent fix route. Delete after use.
// Re-syncs the Marketing sidebar subcategories (Category/Subcategory), which
// were only ever added via prisma/seed.ts — a script that never runs
// automatically in production — and busts the cached sidebar menu so the
// new "Parcerias" entry (and correct ordering) actually shows up. Also
// removes the leftover "instagram-organico" / "meta-ads" / "google-ads"
// items from the channel-split that was reverted (they coexisted with
// "redes-sociais" / "trafego-pago" in production and broke the migration
// that was supposed to clean them up), and creates the new "Reunião"
// category with its 5 subcategories.
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

const MARKETING_STALE_KEYS = ["instagram-organico", "meta-ads", "google-ads"];

const REUNIAO_SUBS = [
  { key: "salao", name: "Reunião Salão", icon: "Utensils" },
  { key: "delivery", name: "Reunião Delivery", icon: "Truck" },
  { key: "cozinha", name: "Reunião Cozinha", icon: "ChefHat" },
  { key: "gerente", name: "Reunião Gerente", icon: "Briefcase" },
  { key: "lideranca", name: "Reunião Liderança", icon: "Crown" },
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
      await prisma.subcategory.deleteMany({
        where: { categoryId: category.id, key: { in: MARKETING_STALE_KEYS } },
      });
      results.push({ step: "subcategorias marketing (limpeza de duplicatas)", ok: true });

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

  try {
    const reuniaoCategory = await prisma.category.upsert({
      where: { key: "reuniao" },
      update: { name: "Reunião", icon: "Presentation", order: 14, contentType: "reuniao" },
      create: {
        key: "reuniao",
        name: "Reunião",
        icon: "Presentation",
        order: 14,
        contentType: "reuniao",
        isSystem: true,
      },
    });

    let reuniaoOrder = 0;
    for (const sub of REUNIAO_SUBS) {
      await prisma.subcategory.upsert({
        where: { categoryId_key: { categoryId: reuniaoCategory.id, key: sub.key } },
        update: { name: sub.name, icon: sub.icon, order: reuniaoOrder },
        create: {
          categoryId: reuniaoCategory.id,
          key: sub.key,
          name: sub.name,
          icon: sub.icon,
          order: reuniaoOrder,
          isSystem: true,
        },
      });
      reuniaoOrder++;
    }
    results.push({ step: "categoria e subcategorias reuniao (upsert)", ok: true });
  } catch (err) {
    results.push({ step: "categoria reuniao", ok: false, error: String(err) });
  }

  revalidateTag(MENU_CATEGORIES_TAG, { expire: 0 });

  return NextResponse.json({ results });
}
