import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { EstoqueTabs } from "../estoque-tabs";
import { CmvTeoricoClient } from "./cmv-teorico-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { productTotalCost, cmvPercent, PRODUCT_CATEGORY_LABEL } from "@/lib/ficha";
import { cmvTeoricoPercentCatalogo } from "@/lib/cmv";
import { subDays } from "date-fns";

const PERIOD_DAYS = 30;

export default async function CmvTeoricoPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const now = new Date();
  const since = subDays(now, PERIOD_DAYS);
  const metaCmvPercent = ctx?.mode === "single" ? ctx.empresa.metaCmvPercent : 30;

  const [products, salesEntries] = await Promise.all([
    prisma.product.findMany({ where: { empresaId: { in: empresaIds } }, include: { ingredients: { include: { ingredient: true } } } }),
    prisma.salesEntry.findMany({ where: { empresaId: { in: empresaIds }, date: { gte: since } } }),
  ]);

  const productsWithCost = products.map((p) => ({ ...p, totalCost: productTotalCost(p.ingredients) }));
  const cmvTeoricoPercent = cmvTeoricoPercentCatalogo(productsWithCost);
  const faturamentoPeriodo = salesEntries.reduce((s, e) => s + e.faturamentoDelivery + e.faturamentoSalao, 0);
  const custoTeoricoTotal = (cmvTeoricoPercent / 100) * faturamentoPeriodo;

  const categoriaChart = Object.entries(PRODUCT_CATEGORY_LABEL)
    .map(([key, label]) => {
      const items = productsWithCost.filter((p) => p.category === key && p.precoVenda > 0);
      return { name: label, value: Math.round(cmvTeoricoPercentCatalogo(items) * 10) / 10, produtos: items.length };
    })
    .filter((c) => c.produtos > 0);

  const produtosMaiorImpacto = productsWithCost
    .filter((p) => p.precoVenda > 0)
    .map((p) => ({ id: p.id, name: p.name, cmv: cmvPercent(p.totalCost, p.precoVenda), custo: p.totalCost, precoVenda: p.precoVenda }))
    .sort((a, b) => b.cmv - a.cmv)
    .slice(0, 10);

  const produtosSemFicha = products.filter((p) => p.ingredients.length === 0).map((p) => ({ id: p.id, name: p.name }));

  return (
    <PageContainer title="Estoque" subtitle="CMV Teórico">
      <div className="space-y-6">
        <EstoqueTabs />
        <CmvTeoricoClient
          faturamentoPeriodo={faturamentoPeriodo}
          custoTeoricoTotal={custoTeoricoTotal}
          cmvTeoricoPercent={cmvTeoricoPercent}
          metaCmvPercent={metaCmvPercent}
          categoriaChart={categoriaChart}
          produtosMaiorImpacto={produtosMaiorImpacto}
          produtosSemFicha={produtosSemFicha}
          periodDays={PERIOD_DAYS}
        />
      </div>
    </PageContainer>
  );
}
