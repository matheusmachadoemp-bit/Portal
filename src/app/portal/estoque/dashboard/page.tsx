import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { EstoqueTabs } from "../estoque-tabs";
import { EstoqueDashboardClient } from "./dashboard-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { ingredientCostPerUnit } from "@/lib/estoque";
import { addDays, subDays } from "date-fns";

const PERIOD_DAYS = 30;
const VENCIMENTO_PROXIMO_DIAS = 7;

export default async function EstoqueDashboardPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const now = new Date();
  const since = subDays(now, PERIOD_DAYS);
  const vencimentoLimite = addDays(now, VENCIMENTO_PROXIMO_DIAS);

  const [ingredients, movements] = await Promise.all([
    prisma.ingredient.findMany({ where: { empresaId: { in: empresaIds } }, orderBy: { name: "asc" } }),
    prisma.stockMovement.findMany({
      where: { empresaId: { in: empresaIds }, createdAt: { gte: since } },
      include: { ingredient: { select: { id: true, name: true, unidade: true, estoqueMinimo: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const valorTotalEstoque = ingredients.reduce((sum, i) => sum + i.estoqueAtual * ingredientCostPerUnit(i), 0);
  const zerados = ingredients.filter((i) => i.estoqueAtual <= 0);
  const critico = ingredients.filter((i) => i.estoqueAtual > 0 && i.estoqueAtual <= i.estoqueMinimo);
  const proximosVencimento = ingredients.filter(
    (i) => i.validade && i.validade <= vencimentoLimite && i.validade >= now
  );

  const entradasPeriodo = movements.filter((m) => m.type === "ENTRADA");
  const saidasPeriodo = movements.filter((m) => m.type === "SAIDA" || m.type === "PERDA");
  const valorEntradas = entradasPeriodo.reduce((sum, m) => {
    const ing = ingredients.find((i) => i.id === m.ingredientId);
    return sum + m.quantidade * (ing ? ingredientCostPerUnit(ing) : 0);
  }, 0);
  const valorSaidas = saidasPeriodo.reduce((sum, m) => {
    const ing = ingredients.find((i) => i.id === m.ingredientId);
    return sum + m.quantidade * (ing ? ingredientCostPerUnit(ing) : 0);
  }, 0);

  // Heurística simples: soma de saídas/perdas no período muito acima do estoque
  // mínimo indica consumo fora do padrão para aquele insumo (não é uma análise
  // estatística de série temporal, apenas um limiar de atenção).
  const consumoPorIngrediente = new Map<string, number>();
  for (const m of saidasPeriodo) {
    consumoPorIngrediente.set(m.ingredientId, (consumoPorIngrediente.get(m.ingredientId) ?? 0) + m.quantidade);
  }
  const consumoAnormal = ingredients.filter((i) => {
    const consumo = consumoPorIngrediente.get(i.id) ?? 0;
    return i.estoqueMinimo > 0 && consumo > i.estoqueMinimo * 3;
  });

  const movementsByType = ["ENTRADA", "SAIDA", "AJUSTE", "PERDA", "TRANSFERENCIA", "INVENTARIO"].map((type) => ({
    type,
    count: movements.filter((m) => m.type === type).length,
  }));

  return (
    <PageContainer title="Estoque" subtitle="Dashboard">
      <div className="space-y-6">
        <EstoqueTabs />
        <EstoqueDashboardClient
          valorTotalEstoque={valorTotalEstoque}
          totalProdutos={ingredients.length}
          critico={critico.map((i) => ({ id: i.id, name: i.name, estoqueAtual: i.estoqueAtual, estoqueMinimo: i.estoqueMinimo, unidade: i.unidade }))}
          zerados={zerados.map((i) => ({ id: i.id, name: i.name, unidade: i.unidade }))}
          proximosVencimento={proximosVencimento.map((i) => ({
            id: i.id,
            name: i.name,
            validade: i.validade!.toISOString(),
          }))}
          consumoAnormal={consumoAnormal.map((i) => ({
            id: i.id,
            name: i.name,
            consumo: consumoPorIngrediente.get(i.id) ?? 0,
            unidade: i.unidade,
          }))}
          entradasCount={entradasPeriodo.length}
          saidasCount={saidasPeriodo.length}
          valorEntradas={valorEntradas}
          valorSaidas={valorSaidas}
          movementsByType={movementsByType}
          periodDays={PERIOD_DAYS}
        />
      </div>
    </PageContainer>
  );
}
