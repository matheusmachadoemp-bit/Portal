import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.ingredient.findUnique({ where: { id } });
  const priceChanged =
    body.precoAtual !== undefined && Number(body.precoAtual) !== existing?.precoAtual;

  const ingredient = await prisma.ingredient.update({
    where: { id },
    data: {
      name: body.name ?? undefined,
      fornecedor: body.fornecedor ?? undefined,
      unidade: body.unidade ?? undefined,
      precoAtual: body.precoAtual !== undefined ? Number(body.precoAtual) : undefined,
      quantidadeEmbalagem: body.quantidadeEmbalagem !== undefined ? Number(body.quantidadeEmbalagem) : undefined,
      percentualPerda: body.percentualPerda !== undefined ? Number(body.percentualPerda) : undefined,
      estoqueMinimo: body.estoqueMinimo !== undefined ? Number(body.estoqueMinimo) : undefined,
      estoqueAtual: body.estoqueAtual !== undefined ? Number(body.estoqueAtual) : undefined,
      lastPurchaseDate: body.lastPurchaseDate ? new Date(body.lastPurchaseDate) : undefined,
      ...(priceChanged ? { priceHistory: { create: { price: Number(body.precoAtual) } } } : {}),
    },
  });

  // O custo dos produtos é calculado dinamicamente a partir do preço atual do
  // insumo, então toda ficha técnica que usa este ingrediente já reflete o
  // novo preço automaticamente — não é necessário atualizar registros em cascata.
  const affectedProducts = priceChanged
    ? await prisma.product.findMany({
        where: { ingredients: { some: { ingredientId: id } } },
        select: { id: true, name: true },
      })
    : [];

  return NextResponse.json({ ingredient, affectedProducts });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.ingredient.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
