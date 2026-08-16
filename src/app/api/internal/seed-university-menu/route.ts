import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// TEMPORARY, ONE-OFF ROUTE. Creates the sidebar subcategories for
// "Universidade Grupo Nord", which were never seeded when the module was
// added. Protected by an authenticated ADMINISTRADOR/GESTOR session, same
// as every other admin menu route — no token. Delete this file after a
// single successful call.
const SUBS = [
  { key: "dashboard", name: "Dashboard", icon: "LayoutDashboard" },
  { key: "trilhas", name: "Trilhas de Aprendizagem", icon: "Route" },
  { key: "cursos", name: "Cursos", icon: "GraduationCap" },
  { key: "videoaulas", name: "Videoaulas", icon: "PlayCircle" },
  { key: "avaliacoes", name: "Avaliações", icon: "ListChecks" },
  { key: "certificados", name: "Certificados", icon: "Award" },
  { key: "colaboradores", name: "Colaboradores", icon: "Users" },
  { key: "ranking", name: "Ranking", icon: "Trophy" },
  { key: "biblioteca", name: "Biblioteca", icon: "BookOpen" },
  { key: "relatorios", name: "Relatórios", icon: "FileBarChart" },
];

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const category = await prisma.category.findUnique({ where: { key: "universidade" } });
  if (!category) return NextResponse.json({ error: "Categoria 'universidade' não encontrada." }, { status: 404 });

  const created: string[] = [];
  for (let i = 0; i < SUBS.length; i++) {
    const s = SUBS[i];
    const existing = await prisma.subcategory.findUnique({
      where: { categoryId_key: { categoryId: category.id, key: s.key } },
    });
    if (existing) continue;
    await prisma.subcategory.create({
      data: { categoryId: category.id, key: s.key, name: s.name, icon: s.icon, order: i },
    });
    created.push(s.key);
  }

  return NextResponse.json({ ok: true, created });
}

export async function GET() {
  return POST();
}
