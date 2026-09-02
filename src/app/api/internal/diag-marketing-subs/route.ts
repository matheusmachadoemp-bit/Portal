import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// TEMPORARY, READ-ONLY diagnostic route. Delete after use.
const DIAG_TOKEN = "f3a7c1e9d62b4085a7c3f1e9d6b2805a4c7f19e3b";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== DIAG_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const category = await prisma.category.findUnique({ where: { key: "marketing" } });
  const subs = category
    ? await prisma.subcategory.findMany({ where: { categoryId: category.id }, orderBy: { order: "asc" } })
    : [];

  const migrations = await prisma.$queryRaw<
    { migration_name: string; finished_at: Date | null; applied_steps_count: number; logs: string | null }[]
  >`SELECT migration_name, finished_at, applied_steps_count, logs FROM "_prisma_migrations" WHERE migration_name LIKE '2026090%' ORDER BY started_at ASC`;

  return NextResponse.json({
    subcategories: subs.map((s) => ({ key: s.key, name: s.name, order: s.order })),
    recentMigrations: migrations,
  });
}
