import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// TEMPORARY, read-only diagnostic route. Delete after use.
// O usuário não está vendo a categoria "Loja Nord" no menu lateral depois
// do deploy da PR #122 (que inclui uma migration de dados inserindo
// Category/Subcategory). Verifica se as linhas realmente existem no banco.
const FIX_TOKEN = "f3a7c1e9b5d2087a4c6e9f1b3d5a7082e6c9a1f4b7";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== FIX_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const category = await prisma.category.findUnique({
    where: { key: "loja-nord" },
    include: { subcategories: true },
  });

  const migrations = await prisma.$queryRawUnsafe<{ migration_name: string; finished_at: Date | null }[]>(
    `SELECT migration_name, finished_at FROM "_prisma_migrations" WHERE migration_name LIKE '%loja_nord%' ORDER BY finished_at`
  );

  const allCategories = await prisma.category.findMany({ select: { key: true, name: true, order: true, active: true } });

  return NextResponse.json({ category, migrations, allCategories });
}
