import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ingredients = await prisma.ingredient.findMany({
    orderBy: { name: "asc" },
    include: { priceHistory: { orderBy: { createdAt: "desc" }, take: 10 } },
  });
  return NextResponse.json({ ingredients });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  const ingredient = await prisma.ingredient.create({
    data: {
      name: body.name,
      fornecedor: body.fornecedor || null,
      unidade: body.unidade || "g",
      precoAtual: Number(body.precoAtual) || 0,
      quantidadeEmbalagem: Number(body.quantidadeEmbalagem) || 1,
      percentualPerda: Number(body.percentualPerda) || 0,
      estoqueMinimo: Number(body.estoqueMinimo) || 0,
      estoqueAtual: Number(body.estoqueAtual) || 0,
      lastPurchaseDate: body.lastPurchaseDate ? new Date(body.lastPurchaseDate) : null,
      priceHistory: { create: { price: Number(body.precoAtual) || 0 } },
    },
  });

  return NextResponse.json({ ingredient });
}
