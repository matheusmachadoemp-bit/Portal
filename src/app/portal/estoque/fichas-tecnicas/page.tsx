import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { EstoqueTabs } from "../estoque-tabs";
import { FichasTecnicasClient } from "./fichas-tecnicas-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { productTotalCost, cmvPercent, margemContribuicao, PRODUCT_CATEGORY_LABEL } from "@/lib/ficha";

export default async function FichasTecnicasPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const products = await prisma.product.findMany({
    where: { empresaId: { in: empresaIds } },
    orderBy: { name: "asc" },
    include: { ingredients: { include: { ingredient: true } } },
  });

  const rows = products.map((p) => {
    const totalCost = productTotalCost(p.ingredients);
    return {
      id: p.id,
      name: p.name,
      code: p.code,
      category: p.category,
      categoryLabel: PRODUCT_CATEGORY_LABEL[p.category] ?? p.category,
      precoVenda: p.precoVenda,
      totalCost,
      cmv: cmvPercent(totalCost, p.precoVenda),
      margem: margemContribuicao(totalCost, p.precoVenda),
      ingredientesCount: p.ingredients.length,
      subKey:
        p.category === "PIZZA_SALGADA" ? "pizzas-salgadas" :
        p.category === "PIZZA_DOCE" ? "pizzas-doces" :
        p.category === "COMBO" ? "combos" :
        p.category === "ESFIHA_SALGADA" ? "esfihas-salgadas" :
        p.category === "ESFIHA_DOCE" ? "esfihas-doces" :
        p.category === "ACOMPANHAMENTO" ? "acompanhamentos" :
        p.category === "BURGER" ? "burgers" :
        p.category === "BEBIDA" ? "bebidas" :
        p.category === "DRINK" ? "drinks" : "insumos",
    };
  });

  return (
    <PageContainer title="Estoque" subtitle="Fichas Técnicas">
      <div className="space-y-6">
        <EstoqueTabs />
        <FichasTecnicasClient rows={rows} />
      </div>
    </PageContainer>
  );
}
