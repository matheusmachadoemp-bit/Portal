import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { applyMovement, ESTOQUE_TX_OPTIONS, lockIngredientStock } from "@/lib/estoque";
import { hasModulePermission } from "@/lib/authz";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "estoque", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o Estoque." },
      { status: 403 }
    );
  }

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
  if (!(await hasModulePermission(session.user.id, "estoque", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite lançar movimentações de estoque." },
      { status: 403 }
    );
  }

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

  // Transação interativa (não em lote): relê `estoqueAtual` DENTRO da transação, com a linha
  // travada (`lockIngredientStock`/`SELECT ... FOR UPDATE`), para calcular `estoqueApos` a partir
  // do valor mais recente — nunca do valor lido em `ingredient` acima, antes da transação abrir.
  // Sem isso, duas chamadas concorrentes para o MESMO insumo partiam do mesmo valor-base e a que
  // gravasse por último sobrescrevia a outra silenciosamente (lost update — achado de auditoria,
  // 2026-11). O lock é liberado só quando a transação termina, então uma segunda chamada
  // concorrente espera aqui e lê o valor já atualizado pela primeira.
  const movement = await prisma.$transaction(async (tx) => {
    const currentStock = await lockIngredientStock(tx, ingredient.id);
    const estoqueApos = Math.max(0, applyMovement(currentStock, body.type, quantidade));
    const created = await tx.stockMovement.create({
      data: {
        ingredientId: ingredient.id,
        empresaId: empresa.id,
        type: body.type,
        quantidade,
        estoqueApos,
        motivo: body.motivo || null,
        createdById: session.user.id,
      },
    });
    await tx.ingredient.update({ where: { id: ingredient.id }, data: { estoqueAtual: estoqueApos } });
    return created;
  }, ESTOQUE_TX_OPTIONS);

  return NextResponse.json({ movement });
}
