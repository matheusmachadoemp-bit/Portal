import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { EstoqueDashboardClient } from "./dashboard-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { ingredientCostPerUnit } from "@/lib/estoque";
import { productTotalCost } from "@/lib/ficha";
import { cmvRealValor, cmvTeoricoPercentCatalogo, valorComprasNoPeriodo, valorEstoqueEm } from "@/lib/cmv";
import { addDays, startOfWeek, subDays, subWeeks } from "date-fns";

const PERIOD_DAYS = 30;
const VENCIMENTO_PROXIMO_DIAS = 7;
const WEEKS_SERIE = 8;

export default async function EstoqueDashboardPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const now = new Date();
  const since = subDays(now, PERIOD_DAYS);
  const vencimentoLimite = addDays(now, VENCIMENTO_PROXIMO_DIAS);
  const metaCmvPercent =
    ctx?.mode === "single"
      ? ctx.empresa.metaCmvPercent
      : ctx && ctx.empresas.length
        ? ctx.empresas.reduce((s, e) => s + e.metaCmvPercent, 0) / ctx.empresas.length
        : 30;

  const [ingredients, movements, products, losses, purchases, pendingCounts, divergenciasAbertas] = await Promise.all([
    prisma.ingredient.findMany({ where: { empresaId: { in: empresaIds } }, orderBy: { name: "asc" } }),
    prisma.stockMovement.findMany({
      where: { empresaId: { in: empresaIds } },
      include: { ingredient: { select: { id: true, name: true, unidade: true, estoqueMinimo: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.product.findMany({
      where: { empresaId: { in: empresaIds } },
      include: { ingredients: { include: { ingredient: true } } },
    }),
    prisma.loss.findMany({ where: { empresaId: { in: empresaIds }, data: { gte: since } } }),
    prisma.purchase.findMany({ where: { empresaId: { in: empresaIds }, data: { gte: since } }, include: { items: true } }),
    prisma.stockCount.count({ where: { empresaId: { in: empresaIds }, status: { in: ["RASCUNHO", "EM_ANDAMENTO"] } } }),
    prisma.stockCountItem.count({ where: { status: "DIVERGENCIA", justificativa: null, count: { empresaId: { in: empresaIds } } } }),
  ]);

  const movementsInPeriod = movements.filter((m) => m.createdAt >= since);

  const valorTotalEstoque = ingredients.reduce((sum, i) => sum + i.estoqueAtual * ingredientCostPerUnit(i), 0);
  const zerados = ingredients.filter((i) => i.estoqueAtual <= 0);
  const critico = ingredients.filter((i) => i.estoqueAtual > 0 && i.estoqueAtual <= i.estoqueMinimo);
  const proximosVencimento = ingredients.filter(
    (i) => i.validade && i.validade <= vencimentoLimite && i.validade >= now
  );
  const semCusto = ingredients.filter((i) => !i.precoAtual);
  const semFornecedor = ingredients.filter((i) => !i.fornecedorPrincipalId);
  const movimentadosIds = new Set(movementsInPeriod.map((m) => m.ingredientId));
  const semMovimentacao = ingredients.filter((i) => !movimentadosIds.has(i.id));
  const produtosSemFicha = products.filter((p) => p.ingredients.length === 0);

  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));
  const entradasPeriodo = movementsInPeriod.filter((m) => m.type === "ENTRADA");
  const saidasPeriodo = movementsInPeriod.filter((m) => m.type === "SAIDA" || m.type === "PERDA");
  const valorEntradas = entradasPeriodo.reduce((sum, m) => {
    const ing = ingredientById.get(m.ingredientId);
    return sum + m.quantidade * (ing ? ingredientCostPerUnit(ing) : 0);
  }, 0);
  const valorSaidas = saidasPeriodo.reduce((sum, m) => {
    const ing = ingredientById.get(m.ingredientId);
    return sum + m.quantidade * (ing ? ingredientCostPerUnit(ing) : 0);
  }, 0);

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
    count: movementsInPeriod.filter((m) => m.type === type).length,
  }));

  // --- CMV: teórico (catálogo blended) x real (estoque inicial + compras - estoque final) x meta ---
  const productsWithCost = products.map((p) => ({ ...p, totalCost: productTotalCost(p.ingredients) }));
  const cmvTeoricoPercent = cmvTeoricoPercentCatalogo(productsWithCost);
  const faturamentoNoPeriodo = await prisma.salesEntry
    .findMany({ where: { empresaId: { in: empresaIds }, date: { gte: since } } })
    .then((rows) => rows.reduce((sum, r) => sum + r.faturamentoDelivery + r.faturamentoSalao, 0));

  const estoqueInicial = valorEstoqueEm(ingredients, movements, since);
  const estoqueFinal = valorEstoqueEm(ingredients, movements, now);
  const comprasPeriodo = valorComprasNoPeriodo(ingredients, movements, since, now);
  const cmvRealValorPeriodo = cmvRealValor(estoqueInicial, comprasPeriodo, estoqueFinal);
  const cmvRealPercent = faturamentoNoPeriodo ? (cmvRealValorPeriodo / faturamentoNoPeriodo) * 100 : 0;
  const diferencaPP = cmvRealPercent - cmvTeoricoPercent;
  const diferencaFinanceira = cmvRealValorPeriodo - (cmvTeoricoPercent / 100) * faturamentoNoPeriodo;

  const valorPerdas = losses.reduce((sum, l) => sum + l.valorEstimado, 0);
  const valorCompras = purchases.reduce((sum, p) => sum + p.items.reduce((s, it) => s + it.valorTotal, 0), 0);

  // faturamento por semana (aproximado a partir das vendas diárias agregadas)
  const salesEntries = await prisma.salesEntry.findMany({
    where: { empresaId: { in: empresaIds }, date: { gte: startOfWeek(subWeeks(now, WEEKS_SERIE), { weekStartsOn: 1 }) } },
  });
  const evolucaoCmv = Array.from({ length: WEEKS_SERIE }).map((_, idx) => {
    const weekStart = startOfWeek(subWeeks(now, WEEKS_SERIE - 1 - idx), { weekStartsOn: 1 });
    const weekEnd = idx === WEEKS_SERIE - 1 ? now : startOfWeek(subWeeks(now, WEEKS_SERIE - 2 - idx), { weekStartsOn: 1 });
    const inicioSemana = valorEstoqueEm(ingredients, movements, weekStart);
    const fimSemana = valorEstoqueEm(ingredients, movements, weekEnd);
    const comprasSemana = valorComprasNoPeriodo(ingredients, movements, weekStart, weekEnd);
    const realValor = cmvRealValor(inicioSemana, comprasSemana, fimSemana);
    const faturamentoSemana = salesEntries
      .filter((s) => s.date >= weekStart && s.date < weekEnd)
      .reduce((sum, s) => sum + s.faturamentoDelivery + s.faturamentoSalao, 0);
    return {
      periodo: `Sem. ${weekStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`,
      meta: Math.round(metaCmvPercent * 10) / 10,
      teorico: Math.round(cmvTeoricoPercent * 10) / 10,
      real: faturamentoSemana ? Math.round((realValor / faturamentoSemana) * 1000) / 10 : 0,
    };
  });

  const alertas: { label: string; tone: "warning" | "danger" }[] = [];
  if (consumoAnormal.length) alertas.push({ label: `${consumoAnormal[0].name} com consumo acima do previsto`, tone: "warning" });
  const divergenciaMussarela = critico.find((i) => i.name.toLowerCase().includes("mussarela"));
  if (divergenciaMussarela) alertas.push({ label: `${divergenciaMussarela.name} com estoque abaixo do mínimo`, tone: "danger" });
  if (critico.length) alertas.push({ label: `${critico.length} produto(s) abaixo do estoque mínimo`, tone: "warning" });
  if (semMovimentacao.length) alertas.push({ label: `${semMovimentacao.length} produto(s) sem movimentação em ${PERIOD_DAYS} dias`, tone: "warning" });
  if (semFornecedor.length) alertas.push({ label: `${semFornecedor.length} produto(s) sem ficha técnica de fornecedor`, tone: "warning" });
  if (produtosSemFicha.length) alertas.push({ label: `${produtosSemFicha.length} item(ns) do cardápio sem ficha técnica`, tone: "danger" });
  if (valorPerdas > 0) alertas.push({ label: `Desperdício de ${valorPerdas.toFixed(2).replace(".", ",")} registrado no período`, tone: "warning" });
  if (Math.abs(diferencaPP) > 3) alertas.push({ label: `Diferença entre estoque físico e sistema acima de 3 p.p.`, tone: "danger" });

  return (
    <PageContainer title="Estoque" subtitle="Visão Geral">
      <div className="space-y-6">
        <EstoqueDashboardClient
          valorTotalEstoque={valorTotalEstoque}
          totalProdutos={ingredients.length}
          critico={critico.map((i) => ({ id: i.id, name: i.name, estoqueAtual: i.estoqueAtual, estoqueMinimo: i.estoqueMinimo, unidade: i.unidade }))}
          zerados={zerados.map((i) => ({ id: i.id, name: i.name, unidade: i.unidade }))}
          proximosVencimento={proximosVencimento.map((i) => ({ id: i.id, name: i.name, validade: i.validade!.toISOString() }))}
          consumoAnormal={consumoAnormal.map((i) => ({ id: i.id, name: i.name, consumo: consumoPorIngrediente.get(i.id) ?? 0, unidade: i.unidade }))}
          semCusto={semCusto.map((i) => ({ id: i.id, name: i.name }))}
          semFicha={produtosSemFicha.map((p) => ({ id: p.id, name: p.name }))}
          entradasCount={entradasPeriodo.length}
          saidasCount={saidasPeriodo.length}
          valorEntradas={valorEntradas}
          valorSaidas={valorSaidas}
          movementsByType={movementsByType}
          periodDays={PERIOD_DAYS}
          cmvRealPercent={cmvRealPercent}
          cmvTeoricoPercent={cmvTeoricoPercent}
          metaCmvPercent={metaCmvPercent}
          diferencaPP={diferencaPP}
          diferencaFinanceira={diferencaFinanceira}
          valorCompras={valorCompras}
          valorPerdas={valorPerdas}
          contagensPendentes={pendingCounts}
          divergenciasAbertas={divergenciasAbertas}
          evolucaoCmv={evolucaoCmv}
          alertas={alertas}
        />
      </div>
    </PageContainer>
  );
}
