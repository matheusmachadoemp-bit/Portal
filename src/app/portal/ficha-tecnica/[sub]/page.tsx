import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { notFound } from "next/navigation";
import { ProdutosClient } from "./produtos-client";
import { InsumosClient } from "./insumos-client";
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
    const ingredients = await prisma.ingredient.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { name: "asc" },
      include: { priceHistory: { orderBy: { createdAt: "desc" }, take: 10 } },
    });
    const serialized = ingredients.map((i) => ({
      ...i,
      lastPurchaseDate: i.lastPurchaseDate ? i.lastPurchaseDate.toISOString() : null,
      priceHistory: i.priceHistory.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
    }));

    return (
      <PageContainer title="Ficha Técnica" subtitle="Insumos">
        <InsumosClient initialIngredients={serialized} canCreate={canCreate} />
      </PageContainer>
    );
  }

  const info = SUB_MAP[sub];
  if (!info) notFound();

  const [products, ingredients] = await Promise.all([
    prisma.product.findMany({
      where: { empresaId: { in: empresaIds }, category: info.category as never },
      orderBy: { name: "asc" },
      include: { ingredients: { include: { ingredient: true } } },
    }),
    prisma.ingredient.findMany({ where: { empresaId: { in: empresaIds } }, orderBy: { name: "asc" } }),
  ]);

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
    <PageContainer title="Ficha Técnica" subtitle={info.label}>
      <ProdutosClient
        initialProducts={serializedProducts}
        ingredientOptions={serializedIngredients}
        category={info.category}
        canCreate={canCreate}
      />
    </PageContainer>
  );
}
