import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const categories = await prisma.stockCategory.findMany({
    orderBy: { order: "asc" },
    include: { _count: { select: { ingredients: true } } },
  });
  return NextResponse.json({ categories });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "Informe o nome da categoria." }, { status: 400 });

  const key = String(body.name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const maxOrder = await prisma.stockCategory.aggregate({ _max: { order: true } });

  const category = await prisma.stockCategory.create({
    data: {
      key: `${key}-${Date.now().toString(36)}`,
      name: body.name,
      color: body.color || "#2952E3",
      icon: body.icon || "Boxes",
      setor: body.setor || null,
      metaPerdaPercent: body.metaPerdaPercent !== undefined ? Number(body.metaPerdaPercent) : 2,
      periodicidadeContagem: body.periodicidadeContagem || "SEMANAL",
      order: (maxOrder._max.order ?? 0) + 1,
    },
  });
  return NextResponse.json({ category });
}
