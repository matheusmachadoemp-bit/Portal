import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const ingredients = await prisma.ingredient.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) } },
    orderBy: { name: "asc" },
    include: { priceHistory: { orderBy: { createdAt: "desc" }, take: 10 } },
  });
  return NextResponse.json({ ingredients });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível cadastrar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();

  const ingredient = await prisma.ingredient.create({
    data: {
      empresaId: empresa.id,
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
