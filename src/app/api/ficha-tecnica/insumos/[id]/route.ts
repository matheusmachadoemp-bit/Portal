import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.ingredient.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "ficha-tecnica", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar insumos." },
      { status: 403 }
    );
  }
  let name: string | undefined;
  if (body.name !== undefined) {
    name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Informe o nome do insumo." }, { status: 400 });
    }
  }

  const priceChanged =
    body.precoAtual !== undefined && Number(body.precoAtual) !== existing?.precoAtual;

  if (body.fornecedorPrincipalId) {
    const supplier = await prisma.supplier.findUnique({
      where: { id: body.fornecedorPrincipalId },
      select: { empresaId: true },
    });
    if (!supplier || supplier.empresaId !== existing.empresaId) {
      return NextResponse.json({ error: "Fornecedor inválido para esta loja." }, { status: 400 });
    }
  }

  const ingredient = await prisma.ingredient.update({
    where: { id },
    data: {
      name: name ?? undefined,
      fornecedor: body.fornecedor ?? undefined,
      unidade: body.unidade ?? undefined,
      precoAtual: body.precoAtual !== undefined ? Number(body.precoAtual) : undefined,
      quantidadeEmbalagem: body.quantidadeEmbalagem !== undefined ? Number(body.quantidadeEmbalagem) : undefined,
      percentualPerda: body.percentualPerda !== undefined ? Number(body.percentualPerda) : undefined,
      estoqueMinimo: body.estoqueMinimo !== undefined ? Number(body.estoqueMinimo) : undefined,
      estoqueAtual: body.estoqueAtual !== undefined ? Number(body.estoqueAtual) : undefined,
      validade: body.validade !== undefined ? (body.validade ? new Date(body.validade) : null) : undefined,
      lastPurchaseDate: body.lastPurchaseDate ? new Date(body.lastPurchaseDate) : undefined,
      categoryId: body.categoryId !== undefined ? body.categoryId || null : undefined,
      setor: body.setor !== undefined ? body.setor || null : undefined,
      codigoInterno: body.codigoInterno !== undefined ? body.codigoInterno || null : undefined,
      codigoBarras: body.codigoBarras !== undefined ? body.codigoBarras || null : undefined,
      localArmazenamento: body.localArmazenamento !== undefined ? body.localArmazenamento || null : undefined,
      unidadeCompra: body.unidadeCompra !== undefined ? body.unidadeCompra || null : undefined,
      fatorConversao: body.fatorConversao !== undefined ? Number(body.fatorConversao) || 1 : undefined,
      pesoEmbalagem: body.pesoEmbalagem !== undefined ? Number(body.pesoEmbalagem) : undefined,
      rendimentoAproveitavel: body.rendimentoAproveitavel !== undefined ? Number(body.rendimentoAproveitavel) : undefined,
      estoqueMaximo: body.estoqueMaximo !== undefined ? Number(body.estoqueMaximo) : undefined,
      pontoReposicao: body.pontoReposicao !== undefined ? Number(body.pontoReposicao) : undefined,
      fornecedorPrincipalId: body.fornecedorPrincipalId !== undefined ? body.fornecedorPrincipalId || null : undefined,
      perecivel: body.perecivel !== undefined ? !!body.perecivel : undefined,
      active: body.active !== undefined ? !!body.active : undefined,
      fotoUrl: body.fotoUrl !== undefined ? body.fotoUrl || null : undefined,
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
  const existing = await prisma.ingredient.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "ficha-tecnica", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir insumos." },
      { status: 403 }
    );
  }

  // O insumo é referenciado (FK) por várias tabelas: ficha técnica de produtos
  // (ProductIngredient), ficha técnica de itens de produção (ProductionItemIngredient),
  // o item de produção que gera este insumo em estoque (ProductionItem.ingredientId) e
  // histórico de compras/perdas/transferências/contagens (PurchaseItem, Loss,
  // TransferItem, StockCountItem). Optamos por bloquear a exclusão em vez de fazer
  // cascata: apagar a referência em ProductIngredient/ProductionItemIngredient por
  // baixo do pano mudaria a ficha técnica (e o custo calculado) de produtos/itens de
  // produção sem o usuário perceber, e apagar o histórico de compras/perdas/
  // transferências/contagens destruiria dado financeiro/auditável. `Ingredient.active`
  // já existe e já é editável em Estoque > Produtos — "desativar" é uma alternativa
  // real, não uma funcionalidade prometida que não existe.
  //
  // ProductionItem.ingredientId usa `onDelete: SetNull` (não Restrict) porque é uma
  // relação opcional — então excluir o insumo NÃO lança erro nesse caso, só apaga o
  // vínculo silenciosamente (órfão o item de produção, que perde o insumo de saída
  // que ele gera em estoque). Como o Prisma não avisa sobre isso, precisamos checar
  // esse caso ANTES de excluir, e não dá pra confiar só no catch do P2003 abaixo.
  const producesItems = await prisma.productionItem.findMany({
    where: { ingredientId: id },
    select: { name: true },
  });
  if (producesItems.length) {
    return NextResponse.json(
      {
        error: `Não é possível excluir "${existing.name}" porque ele é o insumo de saída do(s) item(ns) de produção: ${producesItems
          .map((p) => p.name)
          .join(", ")}. Excluir quebraria o vínculo de estoque desses itens. Em vez de excluir, desative o insumo em Estoque > Produtos (desmarque "Ativo").`,
      },
      { status: 409 }
    );
  }

  try {
    await prisma.ingredient.delete({ where: { id } });
  } catch (e) {
    // As demais tabelas acima (ProductIngredient, ProductionItemIngredient,
    // PurchaseItem, Loss, TransferItem, StockCountItem) usam `onDelete: Restrict` —
    // o Prisma lança PrismaClientKnownRequestError código P2003 nesses casos (mesma
    // classe de erro já tratada para exclusão de usuário, achado #192). Sem o
    // try/catch a rota devolvia 500 cru e, como a tela não conferia `res.ok`, a
    // exclusão "não acontecia nada" silenciosamente.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      const [products, producedByItems] = await Promise.all([
        prisma.product.findMany({
          where: { ingredients: { some: { ingredientId: id } } },
          select: { name: true },
        }),
        prisma.productionItem.findMany({
          where: { ingredientes: { some: { ingredientId: id } } },
          select: { name: true },
        }),
      ]);
      const usedBy = [...products.map((p) => p.name), ...producedByItems.map((p) => p.name)];
      const detail = usedBy.length
        ? ` Ele está sendo usado em: ${usedBy.join(", ")}.`
        : " Ele já tem movimentações registradas no sistema (compras, perdas, transferências ou contagens de estoque).";
      return NextResponse.json(
        {
          error: `Não é possível excluir "${existing.name}" porque ele está vinculado a outros registros do sistema.${detail} Em vez de excluir, desative o insumo em Estoque > Produtos (desmarque "Ativo") para que ele pare de aparecer em novos cadastros sem perder o histórico.`,
        },
        { status: 409 }
      );
    }
    throw e;
  }

  return NextResponse.json({ ok: true });
}
