import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { EstoqueTabs } from "../estoque-tabs";
import { ProdutosClient } from "./produtos-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function ProdutosPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canCreate = ctx?.mode === "single";

  const [ingredients, categories, suppliers] = await Promise.all([
    prisma.ingredient.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { name: "asc" },
      include: { category: { select: { id: true, name: true, color: true } }, fornecedorPrincipal: { select: { id: true, nomeFantasia: true, razaoSocial: true } } },
    }),
    prisma.stockCategory.findMany({ orderBy: { order: "asc" } }),
    prisma.supplier.findMany({ where: { empresaId: { in: empresaIds }, active: true }, orderBy: { razaoSocial: "asc" } }),
  ]);

  const serialized = ingredients.map((i) => ({
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

  return (
    <PageContainer title="Estoque" subtitle="Produtos">
      <div className="space-y-6">
        <EstoqueTabs />
        <ProdutosClient
          initialIngredients={serialized}
          categories={categories.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.nomeFantasia ?? s.razaoSocial }))}
          canCreate={canCreate}
        />
      </div>
    </PageContainer>
  );
}
