import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");

  const products = await prisma.product.findMany({
    where: {
      empresaId: { in: empresaIdsForContext(ctx) },
      ...(category ? { category: category as never } : {}),
    },
    orderBy: { name: "asc" },
    include: { ingredients: { include: { ingredient: true }, orderBy: { order: "asc" } } },
  });

  return NextResponse.json({ products });
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

  const product = await prisma.product.create({
    data: {
      empresaId: empresa.id,
      name: body.name,
      code: body.code,
      category: body.category,
      photoUrl: body.photoUrl || null,
      taxaIfood: body.taxaIfood !== undefined && body.taxaIfood !== "" ? Number(body.taxaIfood) : null,
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
          (i: { ingredientId: string; quantidadeUsada: string; percentualPerda: string }, idx: number) => ({
            ingredientId: i.ingredientId,
            quantidadeUsada: Number(i.quantidadeUsada) || 0,
            percentualPerda: Number(i.percentualPerda) || 0,
            order: idx,
          })
        ),
      },
    },
    include: { ingredients: { include: { ingredient: true }, orderBy: { order: "asc" } } },
  });

  return NextResponse.json({ product });
}
