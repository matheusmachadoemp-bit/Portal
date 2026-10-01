import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { isValidBlobUrl } from "@/lib/manutencao-server";

// Checagem de cargo (MANAGER_ROLES) — mesmo motivo/gate de src/app/api/ficha-tecnica/produtos/route.ts
// e de src/app/portal/ficha-tecnica/[sub]/page.tsx (a aba "insumos" dessa página, que consome este
// GET para o refresh client-side depois de criar/editar/excluir/ativar um insumo, hoje já bloqueia
// a página inteira para quem não é MANAGER_ROLES — essa checagem na rota é o mesmo gate replicado
// para quem chamar a API direto, fora da tela). Sem ela, qualquer COLABORADOR com o Perfil de
// Permissão padrão "Funcionário" (ficha-tecnica:canView=true de fábrica) conseguia ver
// `precoAtual`/`fornecedorNome` de cada insumo — de um jeito até mais direto que a aba "Produtos"
// (coluna própria na tabela, não um valor derivado de cálculo). Bloqueio da rota inteira, não um
// `select` filtrando o campo: mesmo racional de produtos/route.ts (não há uso legítimo desta rota
// que precise do restante dos dados sem o preço).
//
// Único outro consumidor confirmado deste GET é a aba "Produtos e insumos" de Estoque
// (src/app/portal/estoque/produtos/produtos-client.tsx, função `refresh()`, chamada após
// criar/editar/excluir e pelo botão "Atualizar" da Toolbar). Essa tela NÃO tem gate de cargo algum
// hoje (só `estoque:canView`) e também exibe `precoAtual`/`fornecedorNome` sem nenhuma restrição —
// é uma lacuna correlata a esta, fora do escopo desta tarefa (ver relatório), mas que passa a
// sentir o efeito deste gate: um Colaborador comum que clicar em "Atualizar" nessa tela a partir de
// agora recebe 403 nesta chamada (a lista inicial da tela, carregada direto via Prisma no
// servidor, continua aparecendo — só o refresh client-side para de funcionar para esse perfil).
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "ficha-tecnica", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver a Ficha Técnica." },
      { status: 403 }
    );
  }
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json(
      { error: "Essa listagem é restrita a Administrador, Gestor, Gerente ou Supervisor." },
      { status: 403 }
    );
  }

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
  return NextResponse.json({
    ingredients: ingredients.map((i) => ({
      ...i,
      fornecedorNome: i.fornecedorPrincipal?.nomeFantasia ?? i.fornecedorPrincipal?.razaoSocial ?? null,
    })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "ficha-tecnica", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite cadastrar insumos." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível cadastrar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Informe o nome do insumo." }, { status: 400 });
  }
  if (body.fotoUrl && !isValidBlobUrl(body.fotoUrl)) {
    return NextResponse.json({ error: "URL de arquivo inválida." }, { status: 400 });
  }

  if (body.fornecedorPrincipalId) {
    const supplier = await prisma.supplier.findUnique({
      where: { id: body.fornecedorPrincipalId },
      select: { empresaId: true },
    });
    if (!supplier || supplier.empresaId !== empresa.id) {
      return NextResponse.json({ error: "Fornecedor inválido para esta loja." }, { status: 400 });
    }
  }

  if (body.categoryId) {
    const category = await prisma.stockCategory.findUnique({
      where: { id: body.categoryId },
      select: { empresaId: true },
    });
    if (!category || category.empresaId !== empresa.id) {
      return NextResponse.json({ error: "Categoria inválida para esta loja." }, { status: 400 });
    }
  }

  const ingredient = await prisma.ingredient.create({
    data: {
      empresaId: empresa.id,
      name,
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
