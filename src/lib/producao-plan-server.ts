import { prisma } from "@/lib/prisma";
import {
  applyWeekdayWeight,
  computeQuantidadeSugerida,
  computeWeeklyAverage,
  computeWeeklyTotals,
  explodeProductForecastToIngredients,
  rollUpToProductionItems,
  type ProductForecast,
} from "@/lib/producao-forecast";
import { logProductionOrderHistory } from "@/lib/producao-server";

function dayBounds(date: Date): { dayStart: Date; dayEnd: Date } {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return { dayStart, dayEnd };
}

function defaultPrazoFor(date: Date, horarioLimitePadrao: string | null): Date {
  const prazo = new Date(date);
  prazo.setHours(0, 0, 0, 0);
  const [hh, mm] = (horarioLimitePadrao ?? "15:00").split(":").map(Number);
  prazo.setHours(Number.isFinite(hh) ? hh : 15, Number.isFinite(mm) ? mm : 0, 0, 0);
  return prazo;
}

/**
 * Gera (ou atualiza) o plano de produção de uma loja para uma data.
 * Idempotente: uma ordem já iniciada, finalizada ou ajustada manualmente
 * nunca é sobrescrita — só ordens ainda PENDENTE e sem ajuste são
 * recalculadas, permitindo rodar de novo com segurança (cron + botão manual
 * usam a mesma função).
 */
export async function generateProductionPlan(empresaId: string, targetDate: Date, userId: string | null) {
  const { dayStart } = dayBounds(targetDate);
  const weekday = dayStart.getDay();

  const [settings, weights, items, existingOrders] = await Promise.all([
    prisma.productionSettings.findUnique({ where: { empresaId } }),
    prisma.productionWeekdayWeight.findMany({ where: { empresaId } }),
    prisma.productionItem.findMany({ where: { empresaId, active: true }, include: { stock: true } }),
    prisma.productionOrder.findMany({ where: { empresaId, date: dayStart } }),
  ]);
  const semanasParaMedia = settings?.semanasParaMedia ?? 4;
  const existingByItemId = new Map(existingOrders.map((o) => [o.productionItemId, o]));

  const ingredientIds = items.map((i) => i.ingredientId).filter((id): id is string => !!id);

  const bom = ingredientIds.length
    ? await prisma.productIngredient.findMany({
        where: { ingredientId: { in: ingredientIds } },
        select: { productId: true, ingredientId: true, quantidadeUsada: true, percentualPerda: true },
      })
    : [];
  const productIds = Array.from(new Set(bom.map((b) => b.productId)));

  const salesRows = productIds.length
    ? await prisma.importedSaleItem.findMany({
        where: { empresaId, productId: { in: productIds } },
        select: { productId: true, periodFrom: true, quantidade: true },
      })
    : [];
  const salesByProduct = new Map<string, { periodFrom: Date; quantidade: number }[]>();
  for (const row of salesRows) {
    if (!row.productId) continue;
    const list = salesByProduct.get(row.productId) ?? [];
    list.push({ periodFrom: row.periodFrom, quantidade: row.quantidade });
    salesByProduct.set(row.productId, list);
  }

  const productForecasts: ProductForecast[] = [];
  const forecastMetaByProduct = new Map<string, { mediaSemanal: number; weeksUsed: { weekStart: string; total: number }[] }>();
  for (const productId of productIds) {
    const rows = salesByProduct.get(productId) ?? [];
    const weeklyTotals = computeWeeklyTotals(rows.map((r) => ({ periodFrom: r.periodFrom, quantidade: r.quantidade })));
    const { mediaSemanal, weeksUsed } = computeWeeklyAverage(weeklyTotals, semanasParaMedia);
    const forecastQty = applyWeekdayWeight(mediaSemanal, weekday, weights);
    productForecasts.push({ productId, forecastQty });
    forecastMetaByProduct.set(productId, { mediaSemanal, weeksUsed });
  }

  const ingredientDemand = explodeProductForecastToIngredients(productForecasts, bom);
  const itemDemand = rollUpToProductionItems(
    ingredientDemand,
    items.map((i) => ({ id: i.id, ingredientId: i.ingredientId }))
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    const necessidadePrevista = itemDemand.get(item.id) ?? 0;
    const estoqueProntoSnapshot = item.stock?.saldoAtual ?? 0;
    const quantidadeSugerida = computeQuantidadeSugerida(necessidadePrevista, estoqueProntoSnapshot, item);

    const existing = existingByItemId.get(item.id);
    if (existing && (existing.ajusteEm || existing.status !== "PENDENTE")) {
      skipped++;
      continue;
    }

    let forecastId: string | null = null;
    if (item.ingredientId) {
      // Aponta pro produto vendável que gerou a necessidade (via ProductIngredient),
      // usado só pra guardar o "como chegamos nesse número" — pega o primeiro
      // produto do BOM que referencia esse ingrediente, suficiente pra explicar.
      const bomLine = bom.find((b) => b.ingredientId === item.ingredientId);
      const meta = bomLine ? forecastMetaByProduct.get(bomLine.productId) : null;
      if (meta) {
        const weight = weights.find((w) => w.weekday === weekday)?.percent ?? 100 / 7;
        const forecast = await prisma.productionForecast.upsert({
          where: { productionItemId_empresaId_targetDate: { productionItemId: item.id, empresaId, targetDate: dayStart } },
          update: {
            weekday,
            weekdayWeightUsed: weight,
            weeksUsed: JSON.stringify(meta.weeksUsed),
            mediaSemanal: meta.mediaSemanal,
            resultingQuantity: necessidadePrevista,
          },
          create: {
            productionItemId: item.id,
            empresaId,
            targetDate: dayStart,
            weekday,
            weekdayWeightUsed: weight,
            weeksUsed: JSON.stringify(meta.weeksUsed),
            mediaSemanal: meta.mediaSemanal,
            resultingQuantity: necessidadePrevista,
          },
        });
        forecastId = forecast.id;
      }
    }

    const prazo = defaultPrazoFor(dayStart, item.horarioLimitePadrao);

    if (existing) {
      await prisma.productionOrder.update({
        where: { id: existing.id },
        data: { necessidadePrevista, estoqueProntoSnapshot, quantidadeSugerida, forecastId, prazo, prioridade: item.prioridadePadrao },
      });
      updated++;
    } else {
      const order = await prisma.productionOrder.create({
        data: {
          productionItemId: item.id,
          empresaId,
          date: dayStart,
          necessidadePrevista,
          estoqueProntoSnapshot,
          quantidadeSugerida,
          forecastId,
          prazo,
          prioridade: item.prioridadePadrao,
        },
      });
      await logProductionOrderHistory(order.id, userId, "CRIADO", "Plano gerado automaticamente.");
      created++;
    }
  }

  return { created, updated, skipped, totalItens: items.length };
}
