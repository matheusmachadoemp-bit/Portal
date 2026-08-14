import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { revalidateTag } from "next/cache";
import { allDreCategories } from "@/lib/dre-structure";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  if (body.dreKey && !allDreCategories().some((c) => c.key === body.dreKey)) {
    return NextResponse.json(
      { error: "É obrigatório vincular a categoria a uma linha válida da DRE." },
      { status: 400 }
    );
  }

  const category = await prisma.financialCategory.update({
    where: { id },
    data: {
      name: body.name ?? undefined,
      type: body.type ?? undefined,
      dreKey: body.dreKey ?? undefined,
      active: body.active ?? undefined,
    },
  });

  revalidateTag("financial-categories", { expire: 0 });
  return NextResponse.json({ category });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.financialCategory.delete({ where: { id } });
  revalidateTag("financial-categories", { expire: 0 });
  return NextResponse.json({ ok: true });
}
