import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { MENU_CATEGORIES_TAG } from "@/lib/menu-categories";

// TEMPORARY, idempotent fix route. Delete after use.
// Creates/updates the Universidade Grupo Nord sidebar subcategories
// (Category/Subcategory), which were only ever added via prisma/seed.ts —
// a script that never runs automatically in production.
const UNIVERSIDADE_SUBS = [
  { key: "dashboard", name: "Dashboard", icon: "LayoutDashboard" },
  { key: "trilhas", name: "Trilhas de Aprendizagem", icon: "Route" },
  { key: "cursos", name: "Cursos", icon: "BookOpen" },
  { key: "videoaulas", name: "Videoaulas", icon: "Video" },
  { key: "avaliacoes", name: "Avaliações", icon: "ClipboardCheck" },
  { key: "certificados", name: "Certificados", icon: "Award" },
  { key: "colaboradores", name: "Colaboradores", icon: "Users" },
  { key: "ranking", name: "Ranking", icon: "Trophy" },
  { key: "biblioteca", name: "Biblioteca", icon: "Library" },
  { key: "relatorios", name: "Relatórios", icon: "FileSpreadsheet" },
  { key: "gestor", name: "Painel do Gestor", icon: "Briefcase" },
];

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results: { step: string; ok: boolean; error?: string }[] = [];

  try {
    const category = await prisma.category.findUnique({ where: { key: "universidade" } });
    if (!category) {
      results.push({ step: "category universidade", ok: false, error: "categoria universidade não encontrada" });
    } else {
      let subOrder = 0;
      for (const sub of UNIVERSIDADE_SUBS) {
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
      results.push({ step: "subcategorias universidade (upsert)", ok: true });
    }
  } catch (err) {
    results.push({ step: "subcategorias universidade", ok: false, error: String(err) });
  }

  revalidateTag(MENU_CATEGORIES_TAG, { expire: 0 });

  return NextResponse.json({ results });
}
