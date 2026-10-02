import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { Section, Badge } from "@/components/ui/stat-card";
import { SortableStatCards } from "@/components/ui/sortable-stat-cards";
import { formatCurrency, formatPercent } from "@/lib/calc";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { cmvPercent, productTotalCost, PRODUCT_CATEGORY_LABEL } from "@/lib/ficha";
import { cmvRealValor, cmvTeoricoPercentCatalogo, cmvTeoricoPercentPonderado, valorComprasNoPeriodo, snapshotsEstoqueEmDatas, valorEstoqueDeSnapshot } from "@/lib/cmv";
import { quantidadeVendidaPorProdutoNoPeriodo } from "@/lib/cmv-server";
import { CmvCharts } from "./charts";
import { startOfDay, subDays } from "date-fns";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { redirect } from "next/navigation";

const DIAS_SERIE = 14;
const DIVERGENCIA_ALERTA_PP = 3;

// Checagem de cargo (MANAGER_ROLES) — mesmo padrão já usado no Financeiro
// (src/app/portal/financeiro/dashboard/page.tsx) e no RH: sem ela, qualquer COLABORADOR com o
// Perfil de Permissão padrão "Funcionário" (cmv:canView=true de fábrica) conseguia ver o
// percentual de CMV (margem) por produto/categoria (achado MÉDIO do Jonas, auditoria de
// 2026-10-01). Aplicada nas 4 telas do módulo "CMV" (esta + cmv-teorico, cmv-real,
// comparativo — mesmo módulo, mesmo gate de hoje, mesma lacuna): as outras 3 não foram citadas
// no achado original do Jonas, mas checam exatamente o mesmo `hasModulePermission(..., "cmv",
// "canView")` sem trava de cargo, e cmv-real/comparativo expõem valor em R$ (não só percentual)
// de estoque/compras/perdas — bloquear só esta tela deixaria essas 3 alcançáveis direto pelo
// sidebar, sem corrigir o problema de verdade.
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export default async function CmvPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "cmv", "canView"))) {
    redirect("/portal/inicio");
  }
  if (!MANAGER_ROLES.includes(session.user.role)) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const now = new Date();
  const periodStart = startOfDay(subDays(now, 30));

  // Limites de cada dia da série (calculados antes do Promise.all pra saber
  // de quais instantes precisamos o "valor do estoque nesse momento" —
  // ver snapshotsEstoqueEmDatas abaixo).
  const dayBoundaries = Array.from({ length: DIAS_SERIE }).map((_, idx) => {
    const day = startOfDay(subDays(now, DIAS_SERIE - 1 - idx));
    const nextDay = startOfDay(subDays(now, DIAS_SERIE - 2 - idx));
    const end = idx === DIAS_SERIE - 1 ? now : nextDay;
    return { day, end };
  });
  const snapshotDates = [periodStart, now, ...dayBoundaries.flatMap((d) => [d.day, d.end])];

  const [products, ingredients, snapshots, movements, salesEntries, quantidadeVendida] = await Promise.all([
    prisma.product.findMany({
      where: { empresaId: { in: empresaIds } },
      include: { ingredients: { include: { ingredient: true } } },
    }),
    prisma.ingredient.findMany({ where: { empresaId: { in: empresaIds } } }),
    // Valor do estoque em cada instante (hoje, início do período e cada dia
    // da série) resolvido no banco, 1 query indexada por data distinta —
    // ver snapshotsEstoqueEmDatas/valorEstoqueDeSnapshot em @/lib/cmv.
    snapshotsEstoqueEmDatas(prisma, empresaIds, snapshotDates),
    // valorComprasNoPeriodo (chamada abaixo pro período inteiro e pra cada
    // dia da série) só soma o que cai dentro de [periodStart, now] — todo
    // dia da série está contido nesse intervalo, então trazer só essa
    // janela do banco não muda nenhum resultado.
    prisma.stockMovement.findMany({
      where: { empresaId: { in: empresaIds }, createdAt: { gte: periodStart, lte: now } },
      orderBy: { createdAt: "desc" },
      select: { ingredientId: true, type: true, quantidade: true, estoqueApos: true, createdAt: true },
    }),
    prisma.salesEntry.findMany({ where: { empresaId: { in: empresaIds }, date: { gte: periodStart } } }),
    quantidadeVendidaPorProdutoNoPeriodo(empresaIds, periodStart, now),
  ]);

  const estoqueEm = (at: Date) => valorEstoqueDeSnapshot(ingredients, snapshots.get(at.getTime())!);

  const productsWithCost = products.map((p) => ({
    ...p,
    totalCost: productTotalCost(p.ingredients),
    quantidadeVendida: quantidadeVendida.get(p.id) ?? 0,
  }));
  // CMV teórico ponderado pelo mix de vendas dos últimos 30 dias (ver cmvTeoricoPercentPonderado
  // em @/lib/cmv) — cai no blended por catálogo só se nenhuma venda do período tiver produto
  // identificado.
  const cmvTeoricoPercent = cmvTeoricoPercentPonderado(productsWithCost) ?? cmvTeoricoPercentCatalogo(productsWithCost);

  const faturamentoNoPeriodo = (start: Date, end: Date) =>
    salesEntries
      .filter((s) => s.date >= start && s.date <= end)
      .reduce((sum, s) => sum + s.faturamentoDelivery + s.faturamentoSalao, 0);

  const faturamentoMes = faturamentoNoPeriodo(periodStart, now);
  const estoqueInicial = estoqueEm(periodStart);
  const estoqueFinal = estoqueEm(now);
  const compras = valorComprasNoPeriodo(ingredients, movements, periodStart, now);
  const cmvRealValorPeriodo = cmvRealValor(estoqueInicial, compras, estoqueFinal);
  const cmvRealPercent = faturamentoMes ? (cmvRealValorPeriodo / faturamentoMes) * 100 : 0;
  const cmvTeoricoValorPeriodo = (cmvTeoricoPercent / 100) * faturamentoMes;
  // Nenhuma movimentação de estoque nos últimos 30 dias (loja nova/sem lançamento) — "Sem dados"
  // em vez de "0%" (achado de produção, 02/10/2026): 0% dava a entender "custo perfeito" quando na
  // verdade não há como calcular ainda. Ver mesmo flag em computeCmvReal (@/lib/cmv-server).
  const semMovimentacaoEstoque = movements.length === 0;

  const diferencaPP = cmvRealPercent - cmvTeoricoPercent;
  const diferencaValor = cmvRealValorPeriodo - cmvTeoricoValorPeriodo;
  const divergenciaAlta = !semMovimentacaoEstoque && Math.abs(diferencaPP) > DIVERGENCIA_ALERTA_PP;

  const dailySeries = dayBoundaries.map(({ day, end }) => {
    const faturamentoDia = faturamentoNoPeriodo(day, end);
    const estoqueInicioDia = estoqueEm(day);
    const estoqueFimDia = estoqueEm(end);
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
    const value = cmvTeoricoPercentPonderado(items) ?? cmvTeoricoPercentCatalogo(items);
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
          O CMV teórico é calculado ponderando o custo de cada ficha técnica pela quantidade vendida de cada
          produto no período (mix de vendas); sem nenhuma venda com produto identificado no período, cai na
          média simples do catálogo. O CMV real usa o estoque (Estoque Inicial + Compras − Estoque Final)
          valorizado ao preço atual dos insumos.
        </p>

        <SortableStatCards
          storageKey="cmv-kpi-order"
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
          cards={[
            { key: "cmv-teorico", label: "CMV Teórico (%)", value: formatPercent(cmvTeoricoPercent), icon: "ClipboardList", color: "#2952E3" },
            {
              key: "cmv-real",
              label: "CMV Real (%)",
              value: semMovimentacaoEstoque ? "Sem dados" : formatPercent(cmvRealPercent),
              icon: "Warehouse",
              color: semMovimentacaoEstoque ? undefined : "#eab308",
            },
            { key: "cmv-real-valor", label: "CMV Real (R$, 30d)", value: formatCurrency(cmvRealValorPeriodo), icon: "DollarSign" },
            {
              key: "diferenca",
              label: "Diferença",
              value: semMovimentacaoEstoque ? "Sem dados" : `${diferencaPP >= 0 ? "+" : ""}${diferencaPP.toFixed(1)} p.p.`,
              icon: semMovimentacaoEstoque ? "Percent" : divergenciaAlta ? "TriangleAlert" : "CheckCircle2",
              color: semMovimentacaoEstoque ? undefined : divergenciaAlta ? "#ef4444" : "#22c55e",
              hint: semMovimentacaoEstoque ? "Sem movimentação de estoque nos últimos 30 dias" : formatCurrency(diferencaValor),
            },
          ]}
        />

        {divergenciaAlta && (
          <div className="flex items-center gap-2 rounded-lg border border-nord-danger/40 bg-nord-danger/5 px-4 py-3">
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
