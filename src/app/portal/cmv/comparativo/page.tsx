import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { ComparativoClient } from "./comparativo-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { breakdownMovimentacoesNoPeriodo, cmvRealValor, cmvTeoricoPercentCatalogo, snapshotsEstoqueEmDatas, valorEstoqueDeSnapshot } from "@/lib/cmv";
import { productTotalCost } from "@/lib/ficha";
import { startOfWeek, subDays, subWeeks } from "date-fns";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { redirect } from "next/navigation";

const PERIOD_DAYS = 30;
const WEEKS_SERIE = 8;

export default async function ComparativoPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "cmv", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const now = new Date();
  const since = subDays(now, PERIOD_DAYS);
  const metaCmvPercent = ctx?.mode === "single" ? ctx.empresa.metaCmvPercent : 30;
  // A prop "canCreate" desta tela controla o botão "Gerar plano de ação",
  // que na verdade chama POST /api/estoque/planos-acao — essa rota exige
  // "canCreate" no módulo "estoque" (o plano de ação é uma feature do
  // módulo de Estoque, só exibida aqui dentro do Comparativo de CMV), não
  // "cmv". Checamos a permissão do módulo certo pra não liberar o botão
  // pra quem tem "cmv:canCreate" mas não tem "estoque:canCreate" (e vice-versa).
  const canManageEstoquePlanos = await hasModulePermission(session.user.id, "estoque", "canCreate");
  const canCreate = ctx?.mode === "single" && canManageEstoquePlanos;

  // Limites de cada semana do gráfico (calculados antes do Promise.all —
  // precisamos deles tanto pra saber quais instantes consultar no snapshot
  // de estoque quanto pra saber até onde a janela de movimentações "no
  // período" precisa voltar).
  const weekBoundaries = Array.from({ length: WEEKS_SERIE }).map((_, idx) => {
    const weekStart = startOfWeek(subWeeks(now, WEEKS_SERIE - 1 - idx), { weekStartsOn: 1 });
    const weekEnd = idx === WEEKS_SERIE - 1 ? now : startOfWeek(subWeeks(now, WEEKS_SERIE - 2 - idx), { weekStartsOn: 1 });
    return { weekStart, weekEnd };
  });
  // O gráfico semanal (WEEKS_SERIE semanas) alcança mais pra trás do que o
  // KPI do topo (PERIOD_DAYS dias) — a janela de movimentações "no período"
  // buscada no banco precisa cobrir a mais antiga das duas, senão as
  // primeiras semanas do gráfico ficam sem as movimentações mais antigas
  // que breakdownMovimentacoesNoPeriodo ainda precisa somar.
  const earliestPeriodStart = weekBoundaries.reduce((min, w) => (w.weekStart < min ? w.weekStart : min), since);
  const snapshotDates = [since, now, ...weekBoundaries.flatMap((w) => [w.weekStart, w.weekEnd])];

  const [ingredients, snapshots, movements, salesEntries, products, plans] = await Promise.all([
    prisma.ingredient.findMany({ where: { empresaId: { in: empresaIds } } }),
    // Valor do estoque em cada instante (início/fim do KPI e de cada
    // semana) resolvido no banco, 1 query indexada por data distinta — ver
    // snapshotsEstoqueEmDatas/valorEstoqueDeSnapshot em @/lib/cmv.
    snapshotsEstoqueEmDatas(prisma, empresaIds, snapshotDates),
    prisma.stockMovement.findMany({
      where: { empresaId: { in: empresaIds }, createdAt: { gte: earliestPeriodStart, lte: now } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.salesEntry.findMany({ where: { empresaId: { in: empresaIds }, date: { gte: subWeeks(now, WEEKS_SERIE) } } }),
    prisma.product.findMany({ where: { empresaId: { in: empresaIds } }, include: { ingredients: { include: { ingredient: true } } } }),
    prisma.actionPlan.findMany({ where: { empresaId: { in: empresaIds } }, orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true } } } }),
  ]);

  const estoqueEm = (at: Date) => valorEstoqueDeSnapshot(ingredients, snapshots.get(at.getTime())!);

  const productsWithCost = products.map((p) => ({ ...p, totalCost: productTotalCost(p.ingredients) }));
  const cmvTeoricoPercent = cmvTeoricoPercentCatalogo(productsWithCost);

  const estoqueInicial = estoqueEm(since);
  const estoqueFinal = estoqueEm(now);
  const breakdown = breakdownMovimentacoesNoPeriodo(ingredients, movements, since, now);
  const custoConsumido = cmvRealValor(
    estoqueInicial + breakdown.transferenciasRecebidas,
    breakdown.compras - breakdown.transferenciasEnviadas - breakdown.devolucoes + breakdown.ajustes,
    estoqueFinal
  );
  const faturamentoPeriodo = salesEntries
    .filter((s) => s.date >= since)
    .reduce((s, e) => s + e.faturamentoDelivery + e.faturamentoSalao, 0);
  const cmvRealPercent = faturamentoPeriodo ? (custoConsumido / faturamentoPeriodo) * 100 : 0;
  const cmvTeoricoValor = (cmvTeoricoPercent / 100) * faturamentoPeriodo;

  const semanal = weekBoundaries.map(({ weekStart, weekEnd }) => {
    const inicioSemana = estoqueEm(weekStart);
    const fimSemana = estoqueEm(weekEnd);
    const b = breakdownMovimentacoesNoPeriodo(ingredients, movements, weekStart, weekEnd);
    const realValor = cmvRealValor(inicioSemana + b.transferenciasRecebidas, b.compras - b.transferenciasEnviadas - b.devolucoes + b.ajustes, fimSemana);
    const faturamentoSemana = salesEntries.filter((s) => s.date >= weekStart && s.date < weekEnd).reduce((s, e) => s + e.faturamentoDelivery + e.faturamentoSalao, 0);
    return {
      periodo: `Sem. ${weekStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`,
      real: faturamentoSemana ? Math.round((realValor / faturamentoSemana) * 1000) / 10 : 0,
      teorico: Math.round(cmvTeoricoPercent * 10) / 10,
    };
  });

  const perdasPorSetor = new Map<string, number>();
  const custoById = new Map(ingredients.map((i) => [i.id, i.precoAtual / (i.quantidadeEmbalagem || 1)]));
  for (const m of movements.filter((m) => m.type === "PERDA" && m.createdAt >= since)) {
    const ing = ingredients.find((i) => i.id === m.ingredientId);
    const setor = ing?.setor ?? "Sem setor";
    perdasPorSetor.set(setor, (perdasPorSetor.get(setor) ?? 0) + m.quantidade * (custoById.get(m.ingredientId) ?? 0));
  }
  const perdasPorSetorChart = [...perdasPorSetor.entries()].map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value);

  return (
    <PageContainer title="CMV" subtitle="Comparativo Real x Teórico" backHref="/portal/cmv" backLabel="CMV">
      <div className="space-y-6">
        <ComparativoClient
          key={ctx?.mode === "single" ? ctx.empresa.id : "grupo"}
          cmvRealPercent={cmvRealPercent}
          cmvTeoricoPercent={cmvTeoricoPercent}
          custoConsumido={custoConsumido}
          cmvTeoricoValor={cmvTeoricoValor}
          metaCmvPercent={metaCmvPercent}
          semanal={semanal}
          perdasPorSetorChart={perdasPorSetorChart}
          plans={plans.map((p) => ({
            id: p.id,
            problema: p.problema,
            causaProvavel: p.causaProvavel,
            acaoCorretiva: p.acaoCorretiva,
            responsavel: p.responsavel,
            prazo: p.prazo ? p.prazo.toISOString() : null,
            status: p.status,
            createdByName: p.createdBy.name,
          }))}
          canCreate={canCreate}
          canEditMeta={ctx?.mode === "single"}
        />
      </div>
    </PageContainer>
  );
}
