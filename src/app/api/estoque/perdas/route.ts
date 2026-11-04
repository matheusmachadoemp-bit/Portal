import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { isValidBlobUrl } from "@/lib/manutencao-server";
import { ESTOQUE_TX_OPTIONS, ingredientCostPerUnit, lockIngredientStock } from "@/lib/estoque";

export async function GET() {
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

  const losses = await prisma.loss.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) } },
    orderBy: { data: "desc" },
    take: 300,
    include: { ingredient: { select: { id: true, name: true, unidade: true, setor: true } }, createdBy: { select: { name: true } } },
  });
  return NextResponse.json({ losses });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "estoque", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite registrar perdas de estoque." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para registrar uma perda." }, { status: 400 });
  }

  const body = await req.json();
  if (!body.ingredientId || !body.motivo || body.quantidade === undefined) {
    return NextResponse.json({ error: "Informe o produto, a quantidade e o motivo." }, { status: 400 });
  }
  if (body.fotoUrl && !isValidBlobUrl(body.fotoUrl)) {
    return NextResponse.json({ error: "URL de arquivo inválida." }, { status: 400 });
  }

  const ingredient = await prisma.ingredient.findUnique({ where: { id: body.ingredientId } });
  if (!ingredient || ingredient.empresaId !== empresa.id) {
    return NextResponse.json({ error: "Produto inválido para esta loja." }, { status: 400 });
  }

  const quantidade = Number(body.quantidade) || 0;
  // ingredientCostPerUnit: precoAtual já é o preço de 1 `unidade` (ver comentário na definição em
  // @/lib/estoque) — não dividir por quantidadeEmbalagem de novo.
  const valorEstimado = body.valorEstimado !== undefined ? Number(body.valorEstimado) : ingredientCostPerUnit(ingredient) * quantidade;

  // Transação interativa (não em lote): relê `estoqueAtual` DENTRO da transação, com a linha
  // travada (`lockIngredientStock`/`SELECT ... FOR UPDATE`), pra calcular `estoqueApos` a partir
  // do valor mais recente — nunca do `ingredient.estoqueAtual` lido acima, antes da transação
  // abrir. Mesma correção de lost update aplicada em POST /api/estoque/movimentos (achado de
  // auditoria, 2026-11): sem isso, uma perda concorrente com outro movimento do mesmo insumo
  // sobrescrevia silenciosamente o resultado do outro.
  const loss = await prisma.$transaction(async (tx) => {
    const currentStock = await lockIngredientStock(tx, ingredient.id);
    const estoqueApos = Math.max(0, currentStock - quantidade);
    const created = await tx.loss.create({
      data: {
        empresaId: empresa.id,
        setor: body.setor || ingredient.setor || null,
        ingredientId: ingredient.id,
        quantidade,
        unidade: ingredient.unidade,
        valorEstimado,
        motivo: body.motivo,
        responsavel: body.responsavel || session.user.name || null,
        aprovador: body.aprovador || null,
        fotoUrl: body.fotoUrl || null,
        observacao: body.observacao || null,
        createdById: session.user.id,
      },
    });
    await tx.stockMovement.create({
      data: {
        ingredientId: ingredient.id,
        empresaId: empresa.id,
        type: "PERDA",
        quantidade,
        estoqueApos,
        motivo: `Perda — ${body.motivo}`,
        origin: "PERDA",
        createdById: session.user.id,
      },
    });
    await tx.ingredient.update({ where: { id: ingredient.id }, data: { estoqueAtual: estoqueApos } });
    return created;
  }, ESTOQUE_TX_OPTIONS);

  return NextResponse.json({ loss });
}
