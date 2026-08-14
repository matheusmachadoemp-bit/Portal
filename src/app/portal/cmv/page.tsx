import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { Section, Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { formatCurrency, formatPercent } from "@/lib/calc";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { cmvPercent, productTotalCost, PRODUCT_CATEGORY_LABEL } from "@/lib/ficha";
import { cmvRealValor, cmvTeoricoPercentCatalogo, valorComprasNoPeriodo, valorEstoqueEm } from "@/lib/cmv";
import { CmvCharts } from "./charts";
import { startOfDay, subDays } from "date-fns";

const DIAS_SERIE = 14;
const DIVERGENCIA_ALERTA_PP = 3;

export default async function CmvPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const now = new Date();
  const periodStart = startOfDay(subDays(now, 30));

  const [products, ingredients, movements, salesEntries] = await Promise.all([
    prisma.product.findMany({
      where: { empresaId: { in: empresaIds } },
      include: { ingredients: { include: { ingredient: true } } },
    }),
    prisma.ingredient.findMany({ where: { empresaId: { in: empresaIds } } }),
    prisma.stockMovement.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { createdAt: "desc" },
      select: { ingredientId: true, type: true, quantidade: true, estoqueApos: true, createdAt: true },
    }),
    prisma.salesEntry.findMany({ where: { empresaId: { in: empresaIds }, date: { gte: periodStart } } }),
  ]);

  const productsWithCost = products.map((p) => ({ ...p, totalCost: productTotalCost(p.ingredients) }));
  const cmvTeoricoPercent = cmvTeoricoPercentCatalogo(productsWithCost);

  const faturamentoNoPeriodo = (start: Date, end: Date) =>
    salesEntries
      .filter((s) => s.date >= start && s.date <= end)
      .reduce((sum, s) => sum + s.faturamentoDelivery + s.faturamentoSalao, 0);

  const faturamentoMes = faturamentoNoPeriodo(periodStart, now);
  const estoqueInicial = valorEstoqueEm(ingredients, movements, periodStart);
  const estoqueFinal = valorEstoqueEm(ingredients, movements, now);
  const compras = valorComprasNoPeriodo(ingredients, movements, periodStart, now);
  const cmvRealValorPeriodo = cmvRealValor(estoqueInicial, compras, estoqueFinal);
  const cmvRealPercent = faturamentoMes ? (cmvRealValorPeriodo / faturamentoMes) * 100 : 0;
  const cmvTeoricoValorPeriodo = (cmvTeoricoPercent / 100) * faturamentoMes;

  const diferencaPP = cmvRealPercent - cmvTeoricoPercent;
  const diferencaValor = cmvRealValorPeriodo - cmvTeoricoValorPeriodo;
  const divergenciaAlta = Math.abs(diferencaPP) > DIVERGENCIA_ALERTA_PP;

  const dailySeries = Array.from({ length: DIAS_SERIE }).map((_, idx) => {
    const day = startOfDay(subDays(now, DIAS_SERIE - 1 - idx));
    const nextDay = startOfDay(subDays(now, DIAS_SERIE - 2 - idx));
    const end = idx === DIAS_SERIE - 1 ? now : nextDay;
    const faturamentoDia = faturamentoNoPeriodo(day, end);
    const estoqueInicioDia = valorEstoqueEm(ingredients, movements, day);
    const estoqueFimDia = valorEstoqueEm(ingredients, movements, end);
    const comprasDia = valorComprasNoPeriodo(ingredients, movements, day, end);
    const realValorDia = cmvRealValor(estoqueInicioDia, comprasDia, estoqueFimDia);
    return {
      date: day.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      teorico: Math.round(cmvTeoricoPercent * 10) / 10,
      real: faturamentoDia ? Math.round((realValorDia / faturamentoDia) * 1000) / 10 : 0,
    };
  });

  const categoriaChart = Object.entries(PRODUCT_CATEGORY_LABEL).map(([key, label]) => {
    const items = productsWithCost.filter((p) => p.category === key && p.precoVenda > 0);
    const value = cmvTeoricoPercentCatalogo(items);
    return { name: label, value: Math.round(value * 10) / 10 };
  }).filter((c) => c.value > 0);

  const produtosAcimaDoPadrao = productsWithCost
    .filter((p) => p.precoVenda > 0)
    .map((p) => ({ id: p.id, name: p.name, cmv: cmvPercent(p.totalCost, p.precoVenda) }))
    .sort((a, b) => b.cmv - a.cmv)
    .slice(0, 10);

  return (
    <PageContainer title="CMV" subtitle="Teórico x Real">
      <div className="space-y-6">
        <p className="text-xs text-nord-gray bg-nord-panel border border-nord-border rounded-lg px-3 py-2">
          O CMV teórico é calculado a partir do catálogo de fichas técnicas (custo total ÷ preço de venda de
          cada produto), pois o sistema ainda não registra a quantidade vendida por produto — não reflete o
          mix real de vendas. O CMV real usa o estoque (Estoque Inicial + Compras − Estoque Final) valorizado
          ao preço atual dos insumos.
        </p>

        <SortableStatCards
          storageKey="cmv-kpi-order"
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
          cards={[
            { key: "cmv-teorico", label: "CMV Teórico (%)", value: formatPercent(cmvTeoricoPercent), icon: "ClipboardList", color: "#2952E3" },
            { key: "cmv-real", label: "CMV Real (%)", value: formatPercent(cmvRealPercent), icon: "Warehouse", color: "#eab308" },
            { key: "cmv-real-valor", label: "CMV Real (R$, 30d)", value: formatCurrency(cmvRealValorPeriodo), icon: "DollarSign" },
            {
              key: "diferenca",
              label: "Diferença",
              value: `${diferencaPP >= 0 ? "+" : ""}${diferencaPP.toFixed(1)} p.p.`,
              icon: divergenciaAlta ? "TriangleAlert" : "CheckCircle2",
              color: divergenciaAlta ? "#ef4444" : "#22c55e",
              hint: formatCurrency(diferencaValor),
            },
          ]}
        />

        {divergenciaAlta && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/5 px-4 py-3">
            <Badge tone="danger">Atenção</Badge>
            <p className="text-sm text-white">
              CMV Real está {diferencaPP >= 0 ? diferencaPP.toFixed(1) : (-diferencaPP).toFixed(1)} pontos
              percentuais {diferencaPP >= 0 ? "acima" : "abaixo"} do CMV Teórico nos últimos 30 dias.
            </p>
          </div>
        )}

        <CmvCharts dailySeries={dailySeries} categoriaChart={categoriaChart} />

        <Section title="Produtos com maior CMV (catálogo)">
          <div className="space-y-1.5">
            {produtosAcimaDoPadrao.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm border-b border-nord-border/60 py-1.5 last:border-0">
                <span className="text-white">{p.name}</span>
                <Badge tone={p.cmv > 35 ? "danger" : p.cmv > 28 ? "warning" : "success"}>{formatPercent(p.cmv)}</Badge>
              </div>
            ))}
            {produtosAcimaDoPadrao.length === 0 && <p className="text-sm text-nord-gray text-center py-4">Nenhum produto com preço de venda cadastrado.</p>}
          </div>
        </Section>
      </div>
    </PageContainer>
  );
}
