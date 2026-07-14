import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");

  const products = await prisma.product.findMany({
    where: category ? { category: category as never } : undefined,
    orderBy: { name: "asc" },
    include: { ingredients: { include: { ingredient: true } } },
  });

  return NextResponse.json({ products });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  const product = await prisma.product.create({
    data: {
      name: body.name,
      code: body.code,
      category: body.category,
      photoUrl: body.photoUrl || null,
      description: body.description || null,
      rendimento: body.rendimento || null,
      tamanho: body.tamanho || null,
      pesoFinal: body.pesoFinal ? Number(body.pesoFinal) : null,
      precoVenda: Number(body.precoVenda) || 0,
      modoPreparo: body.modoPreparo || null,
      tempoPreparo: body.tempoPreparo ? Number(body.tempoPreparo) : null,
      validade: body.validade || null,
      responsavel: body.responsavel || null,
      createdById: session.user.id,
      ingredients: {
        create: (body.ingredients || []).map(
          (i: { ingredientId: string; quantidadeUsada: string; percentualPerda: string }) => ({
            ingredientId: i.ingredientId,
            quantidadeUsada: Number(i.quantidadeUsada) || 0,
            percentualPerda: Number(i.percentualPerda) || 0,
          })
        ),
      },
    },
    include: { ingredients: { include: { ingredient: true } } },
  });

  return NextResponse.json({ product });
}
