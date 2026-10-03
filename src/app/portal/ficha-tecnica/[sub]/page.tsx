import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { StatCard } from "@/components/ui/stat-card";
import { notFound, redirect } from "next/navigation";
import { ProdutosClient } from "./produtos-client";
import { InsumosClient } from "./insumos-client";
import { QualidadePanel } from "./qualidade-panel";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { productTotalCost, cmvPercent, FICHA_TECNICA_SUB_MAP, defaultFichaTecnicaSub } from "@/lib/ficha";
import { formatPercent } from "@/lib/calc";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";

const SUB_MAP = FICHA_TECNICA_SUB_MAP;

// Checagem de cargo (MANAGER_ROLES) — ver comentário completo em
// src/app/api/ficha-tecnica/produtos/route.ts (achado ALTO do Jonas, auditoria de 2026-10-01).
// Aplicada a TODAS as abas desta página, incluindo "insumos" (tratada à parte logo abaixo, mas
// sujeita ao mesmo gate antes de chegar lá). Até esta tarefa, "insumos" ficava DELIBERADAMENTE
// fora deste bloqueio: o achado original só cobria as abas de categoria de produto, por escopo.
// O Teulis, revisando aquele PR, confirmou que "insumos" expõe o mesmo custo/fornecedor de um
// jeito ainda mais direto (coluna própria `precoAtual`/`fornecedorNome` em cada linha da tabela,
// não um cálculo derivado) e recomendou fechar isso como tarefa separada — esta é essa tarefa.
// O GET que alimenta o refresh client-side desta aba (`src/app/api/ficha-tecnica/insumos/route.ts`)
// recebeu o mesmo gate, pelo mesmo motivo.
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export default async function FichaTecnicaSubPage({ params }: { params: Promise<{ sub: string }> }) {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "ficha-tecnica", "canView"))) {
    redirect("/portal/inicio");
  }

  const { sub } = await params;
  if (!MANAGER_ROLES.includes(session.user.role)) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canManageFichaTecnica = await hasModulePermission(session.user.id, "ficha-tecnica", "canCreate");
  const canCreate = ctx?.mode === "single" && canManageFichaTecnica;

  if (sub === "insumos") {
    // Card "CMV médio do cardápio": média do CMV% de TODOS os produtos com `precoVenda > 0`,
    // não importa a categoria — faz sentido só aqui, porque "Insumos" não tem uma categoria de
    // produto própria pra filtrar (é a lista de ingredientes, comum a qualquer categoria). Nas
    // abas de categoria (ver ramo abaixo), o card mostra a média só daquela categoria — ver
    // histórico da tarefa #476/#477 (Matheus relatou que o número "fixo" do card não batia com a
    // conta manual dele: o problema não era a fórmula, era nunca filtrar por categoria, já que o
    // MESMO card de cardápio inteiro aparecia em toda aba, inclusive dentro de "Pizzas Salgadas").
    const [allProducts, ingredients, categories, suppliers] = await Promise.all([
      prisma.product.findMany({
        where: { empresaId: { in: empresaIds }, precoVenda: { gt: 0 } },
        select: { precoVenda: true, ingredients: { include: { ingredient: true } } },
      }),
      prisma.ingredient.findMany({
        where: { empresaId: { in: empresaIds } },
        orderBy: { name: "asc" },
        include: {
          priceHistory: { orderBy: { createdAt: "desc" }, take: 10 },
          category: { select: { id: true, name: true, color: true, icon: true } },
          fornecedorPrincipal: { select: { id: true, nomeFantasia: true, razaoSocial: true } },
        },
      }),
      prisma.stockCategory.findMany({ where: { empresaId: { in: empresaIds }, active: true }, orderBy: { order: "asc" } }),
      prisma.supplier.findMany({ where: { empresaId: { in: empresaIds }, active: true }, orderBy: { razaoSocial: "asc" } }),
    ]);
    const cmvValues = allProducts.map((p) => cmvPercent(productTotalCost(p.ingredients), p.precoVenda));
    const cmvMedioCardapio = cmvValues.length ? cmvValues.reduce((s, v) => s + v, 0) / cmvValues.length : 0;
    const cmvMedioCard = (
      <StatCard label="CMV médio do cardápio" value={formatPercent(cmvMedioCardapio)} icon="Calculator" />
    );

    const serialized = ingredients.map((i) => ({
      ...i,
      lastPurchaseDate: i.lastPurchaseDate ? i.lastPurchaseDate.toISOString() : null,
      validade: i.validade ? i.validade.toISOString() : null,
      priceHistory: i.priceHistory.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
      fornecedorNome: i.fornecedorPrincipal?.nomeFantasia ?? i.fornecedorPrincipal?.razaoSocial ?? null,
    }));

    return (
      <PageContainer title="Ficha Técnica" subtitle="Insumos">
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{cmvMedioCard}</div>
          <InsumosClient
            initialIngredients={serialized}
            categories={categories.map((c) => ({ id: c.id, name: c.name, color: c.color, icon: c.icon }))}
            suppliers={suppliers.map((s) => ({ id: s.id, name: s.nomeFantasia ?? s.razaoSocial }))}
            canCreate={canCreate}
            isGrupoNordMode={ctx?.mode !== "single"}
          />
        </div>
      </PageContainer>
    );
  }

  const info = SUB_MAP[sub];
  if (!info) notFound();
  // `sub` é uma aba válida (existe no SUB_MAP), mas pode ser de OUTRA loja (ex.: acessar
  // /portal/ficha-tecnica/pizzas-salgadas direto pela URL com a Zarki Sushi ativa) — nesse caso
  // redireciona pra aba padrão da loja ativa em vez de renderizar uma lista vazia sem explicação
  // (a query de produtos abaixo já é isolada por empresaId, então ficaria vazia mesmo se
  // deixássemos passar). Sem uma loja única ativa (modo Grupo Nord), não redireciona — não há
  // uma loja "errada" pra checar, e o sidebar já lista as abas das duas lojas nesse modo.
  if (ctx?.mode === "single" && info.empresaKey && info.empresaKey !== ctx.empresa.key) {
    redirect(`/portal/ficha-tecnica/${defaultFichaTecnicaSub(ctx.empresa.key)}`);
  }

  const [products, ingredients, qualityConfig] = await Promise.all([
    prisma.product.findMany({
      where: { empresaId: { in: empresaIds }, category: info.category as never },
      orderBy: { name: "asc" },
      include: { ingredients: { include: { ingredient: true }, orderBy: { order: "asc" } } },
    }),
    prisma.ingredient.findMany({ where: { empresaId: { in: empresaIds } }, orderBy: { name: "asc" } }),
    ctx?.mode === "single"
      ? prisma.categoryQualityConfig.findUnique({
          where: { empresaId_category: { empresaId: ctx.empresa.id, category: info.category as never } },
        })
      : Promise.resolve(null),
  ]);

  // Card "CMV médio — <categoria>": média do CMV% só dos produtos DESTA categoria (reaproveita a
  // query `products` acima, já filtrada por `category: info.category`, em vez de somar o cardápio
  // inteiro — ver comentário equivalente no ramo "insumos"). Mesmo critério de antes pra produto
  // sem preço de venda cadastrado: excluído da média (não entra como "CMV 0%"), em vez de alterar
  // o filtro da query `products` em si (ela também alimenta `QualidadePanel`/`ProdutosClient`, que
  // precisam continuar vendo produtos com `precoVenda` zerado/ainda não preenchido).
  const cmvValues = products
    .filter((p) => p.precoVenda > 0)
    .map((p) => cmvPercent(productTotalCost(p.ingredients), p.precoVenda));
  const cmvMedioCategoria = cmvValues.length ? cmvValues.reduce((s, v) => s + v, 0) / cmvValues.length : 0;
  const cmvMedioCard = (
    <StatCard label={`CMV médio — ${info.label}`} value={formatPercent(cmvMedioCategoria)} icon="Calculator" />
  );

  const taxaIfoodPadrao = ctx?.mode === "single" ? ctx.empresa.taxaIfoodPadrao : 30;

  const serializedProducts = products.map((p) => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    ingredients: p.ingredients.map((pi) => ({
      ...pi,
      ingredient: {
        ...pi.ingredient,
        lastPurchaseDate: pi.ingredient.lastPurchaseDate
          ? pi.ingredient.lastPurchaseDate.toISOString()
          : null,
        createdAt: pi.ingredient.createdAt.toISOString(),
        updatedAt: pi.ingredient.updatedAt.toISOString(),
      },
    })),
  }));

  const serializedIngredients = ingredients.map((i) => ({
    ...i,
    lastPurchaseDate: i.lastPurchaseDate ? i.lastPurchaseDate.toISOString() : null,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  }));

  return (
    <PageContainer title="Ficha Técnica" subtitle={info.label} backHref="/portal/ficha-tecnica" backLabel="Ficha Técnica">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{cmvMedioCard}</div>
        <QualidadePanel
          products={serializedProducts}
          category={info.category}
          initialConfig={{
            cmvMaximoPercent: qualityConfig?.cmvMaximoPercent ?? 35,
            diasDesatualizada: qualityConfig?.diasDesatualizada ?? 90,
          }}
          canEdit={canCreate}
        />
        <ProdutosClient
          initialProducts={serializedProducts}
          ingredientOptions={serializedIngredients}
          category={info.category}
          canCreate={canCreate}
          isGrupoNordMode={ctx?.mode !== "single"}
          taxaIfoodPadrao={taxaIfoodPadrao}
        />
      </div>
    </PageContainer>
  );
}
