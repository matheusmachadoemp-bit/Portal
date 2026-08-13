import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { revalidateTag } from "next/cache";
import { allDreCategories } from "@/lib/dre-structure";
import { getFinancialCategories } from "@/lib/financial-categories";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const categories = await getFinancialCategories();
  return NextResponse.json({ categories, dreOptions: allDreCategories() });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  const valid = allDreCategories().some((c) => c.key === body.dreKey);
  if (!valid) {
    return NextResponse.json(
      { error: "É obrigatório vincular a categoria a uma linha válida da DRE." },
      { status: 400 }
    );
  }

  const category = await prisma.financialCategory.create({
    data: {
      name: body.name,
      type: body.type || "DESPESA",
      dreKey: body.dreKey,
    },
  });

  revalidateTag("financial-categories", { expire: 0 });
  return NextResponse.json({ category });
}
