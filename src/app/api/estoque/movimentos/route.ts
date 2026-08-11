import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { applyMovement } from "@/lib/estoque";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const ingredientId = searchParams.get("ingredientId");
  const type = searchParams.get("type");
  const days = searchParams.get("days");

  const movements = await prisma.stockMovement.findMany({
    where: {
      empresaId: { in: empresaIdsForContext(ctx) },
      ...(ingredientId ? { ingredientId } : {}),
      ...(type ? { type: type as never } : {}),
      ...(days ? { createdAt: { gte: new Date(Date.now() - Number(days) * 86400000) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { ingredient: { select: { id: true, name: true, unidade: true } }, createdBy: { select: { name: true } } },
  });

  return NextResponse.json({ movements });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível lançar movimentações no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();
  if (!body.ingredientId || !body.type || body.quantidade === undefined) {
    return NextResponse.json({ error: "Informe o insumo, o tipo e a quantidade." }, { status: 400 });
  }

  const ingredient = await prisma.ingredient.findUnique({ where: { id: body.ingredientId } });
  if (!ingredient || ingredient.empresaId !== empresa.id) {
    return NextResponse.json({ error: "Insumo inválido para esta loja." }, { status: 400 });
  }

  const quantidade = Number(body.quantidade) || 0;
  const estoqueApos = Math.max(0, applyMovement(ingredient.estoqueAtual, body.type, quantidade));

  const [movement] = await prisma.$transaction([
    prisma.stockMovement.create({
      data: {
        ingredientId: ingredient.id,
        empresaId: empresa.id,
        type: body.type,
        quantidade,
        estoqueApos,
        motivo: body.motivo || null,
        createdById: session.user.id,
      },
    }),
    prisma.ingredient.update({ where: { id: ingredient.id }, data: { estoqueAtual: estoqueApos } }),
  ]);

  return NextResponse.json({ movement });
}
