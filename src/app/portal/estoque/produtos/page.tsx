import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { ProdutosClient } from "./produtos-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { redirect } from "next/navigation";

// Estoque > Produtos e Estoque > Categorias foram unificadas nesta única
// subcategoria ("Produtos" absorveu "Categorias" — ver DESIGN_SYSTEM.md e o
// precedente em src/app/portal/financeiro/caixa-da-empresa/). A tela mostra
// duas abas internas (Produtos / Categorias); a URL /portal/estoque/categorias
// deixou de existir.
export default async function ProdutosPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "estoque", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  // canCreate aqui checa o módulo "ficha-tecnica", não "estoque": o formulário da aba
  // "Produtos" (ProdutosClient) cria/edita via /api/ficha-tecnica/insumos, que é protegida
  // por "ficha-tecnica" canCreate/canEdit — precisa bater com o módulo que a API de
  // escrita realmente usa, senão o botão aparece pra quem a API vai recusar (ou some
  // pra quem a API aceitaria).
  const canManageFichaTecnica = await hasModulePermission(session.user.id, "ficha-tecnica", "canCreate");
  const canCreateProduto = ctx?.mode === "single" && canManageFichaTecnica;
  // Mesma lógica do canCreateProduto acima, mas para exclusão: a exclusão (individual
  // e em lote) da aba "Produtos" também acontece via /api/ficha-tecnica/insumos, que
  // é protegida pelo módulo "ficha-tecnica" (canDelete), não "estoque".
  const canDeleteFichaTecnica = await hasModulePermission(session.user.id, "ficha-tecnica", "canDelete");
  const canDeleteProduto = ctx?.mode === "single" && canDeleteFichaTecnica;

  // Categorias de estoque: StockCategory não tem empresaId (é um cadastro global, compartilhado
  // por todas as lojas) e as rotas /api/estoque/categorias não exigem loja específica ativa
  // para criar/editar — diferente de Produtos, aqui não faz sentido travar por
  // "ctx?.mode === 'single'": travaria uma ação que a API aceitaria normalmente em modo Grupo
  // Nord. Só a permissão de verdade importa. Confirmado nas rotas: POST checa canCreate, PATCH
  // (edição de campos e ativar/desativar) checa canEdit.
  const canCreateCategoria = await hasModulePermission(session.user.id, "estoque", "canCreate");
  const canEditCategoria = await hasModulePermission(session.user.id, "estoque", "canEdit");

  const [ingredients, categories, suppliers] = await Promise.all([
    prisma.ingredient.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { name: "asc" },
      include: { category: { select: { id: true, name: true, color: true } }, fornecedorPrincipal: { select: { id: true, nomeFantasia: true, razaoSocial: true } } },
    }),
    // Uma única query: alimenta tanto o grid de gerenciamento da aba "Categorias" (nome,
    // ícone, cor, setor, meta de perda, periodicidade, ativa/inativa, contagem de produtos)
    // quanto os dropdowns de categoria da aba "Produtos" (filtro e formulário) — o client
    // deriva a lista simples (id/nome/cor) a partir desta mesma lista, sem duplicar a query.
    prisma.stockCategory.findMany({
      orderBy: { order: "asc" },
      include: { _count: { select: { ingredients: true } } },
    }),
    prisma.supplier.findMany({ where: { empresaId: { in: empresaIds }, active: true }, orderBy: { razaoSocial: "asc" } }),
  ]);

  const serializedIngredients = ingredients.map((i) => ({
    id: i.id,
    name: i.name,
    codigoInterno: i.codigoInterno,
    codigoBarras: i.codigoBarras,
    categoryId: i.categoryId,
    categoryName: i.category?.name ?? null,
    categoryColor: i.category?.color ?? null,
    setor: i.setor,
    unidade: i.unidade,
    unidadeCompra: i.unidadeCompra,
    fatorConversao: i.fatorConversao,
    precoAtual: i.precoAtual,
    quantidadeEmbalagem: i.quantidadeEmbalagem,
    rendimentoAproveitavel: i.rendimentoAproveitavel,
    percentualPerda: i.percentualPerda,
    estoqueAtual: i.estoqueAtual,
    estoqueMinimo: i.estoqueMinimo,
    estoqueMaximo: i.estoqueMaximo,
    pontoReposicao: i.pontoReposicao,
    localArmazenamento: i.localArmazenamento,
    fornecedorPrincipalId: i.fornecedorPrincipalId,
    fornecedorNome: i.fornecedorPrincipal?.nomeFantasia ?? i.fornecedorPrincipal?.razaoSocial ?? null,
    validade: i.validade ? i.validade.toISOString() : null,
    perecivel: i.perecivel,
    active: i.active,
  }));

  const serializedCategories = categories.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    icon: c.icon,
    setor: c.setor,
    metaPerdaPercent: c.metaPerdaPercent,
    periodicidadeContagem: c.periodicidadeContagem,
    active: c.active,
    produtos: c._count.ingredients,
  }));

  return (
    <PageContainer title="Estoque" subtitle="Produtos">
      <div className="space-y-6">
        <ProdutosClient
          initialIngredients={serializedIngredients}
          initialCategories={serializedCategories}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.nomeFantasia ?? s.razaoSocial }))}
          canCreate={canCreateProduto}
          canDelete={canDeleteProduto}
          canCreateCategoria={canCreateCategoria}
          canEditCategoria={canEditCategoria}
        />
      </div>
    </PageContainer>
  );
}
