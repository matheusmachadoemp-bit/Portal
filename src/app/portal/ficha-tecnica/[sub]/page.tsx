import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { notFound } from "next/navigation";
import { ProdutosClient } from "./produtos-client";
import { InsumosClient } from "./insumos-client";
import { QualidadePanel } from "./qualidade-panel";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

const SUB_MAP: Record<string, { category: string; label: string }> = {
  "pizzas-salgadas": { category: "PIZZA_SALGADA", label: "Pizzas Salgadas" },
  "pizzas-doces": { category: "PIZZA_DOCE", label: "Pizzas Doces" },
  combos: { category: "COMBO", label: "Combos" },
  "esfihas-salgadas": { category: "ESFIHA_SALGADA", label: "Esfihas Salgadas" },
  "esfihas-doces": { category: "ESFIHA_DOCE", label: "Esfihas Doces" },
  acompanhamentos: { category: "ACOMPANHAMENTO", label: "Acompanhamentos" },
  burgers: { category: "BURGER", label: "Burgers" },
  bebidas: { category: "BEBIDA", label: "Bebidas" },
  drinks: { category: "DRINK", label: "Drinks" },
};

export default async function FichaTecnicaSubPage({ params }: { params: Promise<{ sub: string }> }) {
  const { sub } = await params;
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canCreate = ctx?.mode === "single";

  if (sub === "insumos") {
    const [ingredients, categories, suppliers] = await Promise.all([
      prisma.ingredient.findMany({
        where: { empresaId: { in: empresaIds } },
        orderBy: { name: "asc" },
        include: {
          priceHistory: { orderBy: { createdAt: "desc" }, take: 10 },
          category: { select: { id: true, name: true, color: true, icon: true } },
          fornecedorPrincipal: { select: { id: true, nomeFantasia: true, razaoSocial: true } },
        },
      }),
      prisma.stockCategory.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
      prisma.supplier.findMany({ where: { empresaId: { in: empresaIds }, active: true }, orderBy: { razaoSocial: "asc" } }),
    ]);
    const serialized = ingredients.map((i) => ({
      ...i,
      lastPurchaseDate: i.lastPurchaseDate ? i.lastPurchaseDate.toISOString() : null,
      validade: i.validade ? i.validade.toISOString() : null,
      priceHistory: i.priceHistory.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
      fornecedorNome: i.fornecedorPrincipal?.nomeFantasia ?? i.fornecedorPrincipal?.razaoSocial ?? null,
    }));

    return (
      <PageContainer title="Ficha Técnica" subtitle="Insumos">
        <InsumosClient
          initialIngredients={serialized}
          categories={categories.map((c) => ({ id: c.id, name: c.name, color: c.color, icon: c.icon }))}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.nomeFantasia ?? s.razaoSocial }))}
          canCreate={canCreate}
        />
      </PageContainer>
    );
  }

  const info = SUB_MAP[sub];
  if (!info) notFound();

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
          taxaIfoodPadrao={taxaIfoodPadrao}
        />
      </div>
    </PageContainer>
  );
}
