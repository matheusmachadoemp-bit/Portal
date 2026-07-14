import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  await prisma.product.update({
    where: { id },
    data: {
      name: body.name ?? undefined,
      code: body.code ?? undefined,
      category: body.category ?? undefined,
      description: body.description ?? undefined,
      rendimento: body.rendimento ?? undefined,
      tamanho: body.tamanho ?? undefined,
      pesoFinal: body.pesoFinal !== undefined ? Number(body.pesoFinal) : undefined,
      precoVenda: body.precoVenda !== undefined ? Number(body.precoVenda) : undefined,
      modoPreparo: body.modoPreparo ?? undefined,
      tempoPreparo: body.tempoPreparo !== undefined ? Number(body.tempoPreparo) : undefined,
      validade: body.validade ?? undefined,
      responsavel: body.responsavel ?? undefined,
    },
  });

  if (body.ingredients) {
    await prisma.productIngredient.deleteMany({ where: { productId: id } });
    await prisma.productIngredient.createMany({
      data: body.ingredients.map(
        (i: { ingredientId: string; quantidadeUsada: string; percentualPerda: string }) => ({
          productId: id,
          ingredientId: i.ingredientId,
          quantidadeUsada: Number(i.quantidadeUsada) || 0,
          percentualPerda: Number(i.percentualPerda) || 0,
        })
      ),
    });
  }

  const product = await prisma.product.findUnique({
    where: { id },
    include: { ingredients: { include: { ingredient: true } } },
  });

  return NextResponse.json({ product });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.product.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
