import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { revalidateTag } from "next/cache";
import { allDreCategories } from "@/lib/dre-structure";
import { getFinancialCategories } from "@/lib/financial-categories";
import { hasModulePermission } from "@/lib/authz";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "financeiro", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o Financeiro." },
      { status: 403 }
    );
  }
  const categories = await getFinancialCategories();
  return NextResponse.json({ categories, dreOptions: allDreCategories() });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "financeiro", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite criar categorias financeiras." },
      { status: 403 }
    );
  }
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
