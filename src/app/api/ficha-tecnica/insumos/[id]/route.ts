import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { isValidBlobUrl } from "@/lib/manutencao-server";
import { excluirIngredientSeNaoEmUso } from "@/lib/ficha-tecnica-server";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  if (body.fotoUrl && !isValidBlobUrl(body.fotoUrl)) {
    return NextResponse.json({ error: "URL de arquivo inválida." }, { status: 400 });
  }

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

  // A regra de "está em uso, não pode excluir" (produção que gera este insumo, ficha técnica,
  // compras, perdas, transferências, contagens, movimentações de estoque) é compartilhada com a
  // exclusão em lote (`POST /api/ficha-tecnica/insumos/excluir-lote`) — ver
  // `excluirIngredientSeNaoEmUso` em `src/lib/ficha-tecnica-server.ts` para o raciocínio completo
  // de cada relacionamento (histórico de 2 bugs reais documentado lá).
  const resultado = await excluirIngredientSeNaoEmUso(id, existing.name);
  if (!resultado.deletado) {
    return NextResponse.json({ error: resultado.motivo }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
