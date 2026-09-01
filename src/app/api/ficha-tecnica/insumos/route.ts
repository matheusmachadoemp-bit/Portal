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
    include: {
      priceHistory: { orderBy: { createdAt: "desc" }, take: 10 },
      category: { select: { id: true, name: true, color: true, icon: true } },
      fornecedorPrincipal: { select: { id: true, nomeFantasia: true, razaoSocial: true } },
    },
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
      validade: body.validade ? new Date(body.validade) : null,
      lastPurchaseDate: body.lastPurchaseDate ? new Date(body.lastPurchaseDate) : null,
      categoryId: body.categoryId || null,
      setor: body.setor || null,
      codigoInterno: body.codigoInterno || null,
      codigoBarras: body.codigoBarras || null,
      localArmazenamento: body.localArmazenamento || null,
      unidadeCompra: body.unidadeCompra || null,
      fatorConversao: body.fatorConversao !== undefined ? Number(body.fatorConversao) || 1 : 1,
      pesoEmbalagem: body.pesoEmbalagem !== undefined ? Number(body.pesoEmbalagem) : null,
      rendimentoAproveitavel: body.rendimentoAproveitavel !== undefined ? Number(body.rendimentoAproveitavel) : null,
      estoqueMaximo: body.estoqueMaximo !== undefined ? Number(body.estoqueMaximo) : null,
      pontoReposicao: body.pontoReposicao !== undefined ? Number(body.pontoReposicao) : null,
      fornecedorPrincipalId: body.fornecedorPrincipalId || null,
      perecivel: !!body.perecivel,
      active: body.active !== undefined ? !!body.active : true,
      fotoUrl: body.fotoUrl || null,
      priceHistory: { create: { price: Number(body.precoAtual) || 0 } },
    },
  });

  return NextResponse.json({ ingredient });
}
