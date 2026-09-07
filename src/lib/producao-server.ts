import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { notifyUser } from "@/lib/tarefas-server";
import { getStoreManagers } from "@/lib/manutencao-server";
import { compareProducedToPlanned, effectiveProductionStatus } from "@/lib/producao";

export const PRODUCTION_MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];
/** Pontos ganhos na régua da Loja Nord por concluir uma produção no prazo e
 * dentro da tolerância — seção 32: nunca premia só por quantidade, só por
 * produzir certo e na hora certa. */
const PRODUCAO_PONTOS_NO_PRAZO = 5;

export { getStoreManagers };

export async function logProductionOrderHistory(
  orderId: string,
  userId: string | null,
  action: string,
  detail?: string | null
): Promise<void> {
  await prisma.productionOrderHistory.create({ data: { orderId, userId, action, detail: detail ?? null } });
}

/** Notifica pelo sino já existente, reaproveitando o helper genérico de
 * Tarefas (mesmo padrão já usado por Loja Nord) — sem link dedicado pro
 * item ainda, leva pra tela geral "Produção de Hoje". */
export async function notifyProducaoUsers(userIds: string[], type: string, title: string, body: string | null): Promise<void> {
  await Promise.all(userIds.map((userId) => notifyUser(userId, type, title, body, null)));
}

/** Inicia uma ordem: registra responsável/hora de início e avança o status. */
export async function iniciarProductionOrder(orderId: string, userId: string) {
  const order = await prisma.productionOrder.update({
    where: { id: orderId },
    data: { status: "EM_PRODUCAO", responsavelId: userId, horaInicio: new Date() },
  });
  await logProductionOrderHistory(orderId, userId, "INICIADO");
  return order;
}

export type FinalizarProductionOrderInput = {
  quantidadeProduzida: number;
  observacao?: string | null;
  fotoUrl?: string | null;
  validade?: Date | null;
};

/** Finaliza uma ordem: grava quantidade produzida, atualiza o estoque pronto
 * (ProductionStock + ledger) e fecha com hora de fim. Nunca aceita
 * quantidade negativa (seção 36). */
export async function finalizarProductionOrder(orderId: string, userId: string, input: FinalizarProductionOrderInput) {
  const quantidadeProduzida = Math.max(input.quantidadeProduzida, 0);

  const order = await prisma.productionOrder.findUniqueOrThrow({ where: { id: orderId } });
  const validadeCalculada =
    input.validade ??
    (await prisma.productionItem
      .findUnique({ where: { id: order.productionItemId }, select: { validadeDias: true } })
      .then((item) => (item?.validadeDias ? new Date(Date.now() + item.validadeDias * 24 * 60 * 60 * 1000) : null)));

  const [updated] = await prisma.$transaction(async (tx) => {
    const stock = await tx.productionStock.upsert({
      where: { productionItemId: order.productionItemId },
      update: { saldoAtual: { increment: quantidadeProduzida } },
      create: { productionItemId: order.productionItemId, empresaId: order.empresaId, saldoAtual: quantidadeProduzida },
    });

    const updatedOrder = await tx.productionOrder.update({
      where: { id: orderId },
      data: {
        status: "CONCLUIDO",
        quantidadeProduzida,
        horaFim: new Date(),
        observacao: input.observacao ?? null,
        fotoUrl: input.fotoUrl ?? null,
        validade: validadeCalculada,
      },
    });

    await tx.productionStockMovement.create({
      data: {
        productionItemId: order.productionItemId,
        empresaId: order.empresaId,
        type: "PRODUCAO",
        quantidade: quantidadeProduzida,
        saldoApos: stock.saldoAtual,
        orderId,
        createdById: userId,
      },
    });

    return [updatedOrder];
  });

  const planejado = order.quantidadeAprovada ?? order.quantidadeSugerida;
  await logProductionOrderHistory(orderId, userId, "FINALIZADO", `Planejado: ${planejado} · Produzido: ${quantidadeProduzida}`);

  await avaliarFinalizacaoProductionOrder(updated, planejado, userId);

  return updated;
}

/** Roda depois de finalizar: pontua na Loja Nord quando aplicável, avisa o
 * gestor quando a produção ficou bem abaixo do planejado, e confere se foi
 * a última pendência do dia pra avisar "produção do dia concluída". */
async function avaliarFinalizacaoProductionOrder(
  order: { id: string; empresaId: string; productionItemId: string; responsavelId: string | null; prazo: Date; horaFim: Date | null; quantidadeProduzida: number | null; date: Date },
  planejado: number,
  userId: string
): Promise<void> {
  const [settings, item] = await Promise.all([
    prisma.productionSettings.findUnique({ where: { empresaId: order.empresaId } }),
    prisma.productionItem.findUniqueOrThrow({ where: { id: order.productionItemId }, select: { name: true, unidade: true } }),
  ]);
  const tolerancia = settings?.toleranciaAlertaPct ?? 10;
  const produzido = order.quantidadeProduzida ?? 0;
  const comparison = compareProducedToPlanned(planejado, produzido, tolerancia);
  const noPrazo = !order.horaFim || order.horaFim.getTime() <= new Date(order.prazo).getTime();

  if (noPrazo && !comparison.alerta) {
    await prisma.lojaNordPointTransaction.create({
      data: {
        userId: order.responsavelId ?? userId,
        empresaId: order.empresaId,
        kind: "GANHO",
        pontos: PRODUCAO_PONTOS_NO_PRAZO,
        origem: "Produção",
        descricao: `Produção concluída no prazo e dentro da tolerância: ${item.name}`,
      },
    });
  }

  if (comparison.alerta === "abaixo") {
    const managerIds = await getStoreManagers(order.empresaId);
    await notifyProducaoUsers(
      managerIds,
      "PRODUCAO_ABAIXO_DO_PLANEJADO",
      `Produção abaixo do planejado: ${item.name}`,
      `Planejado: ${planejado} ${item.unidade} · Produzido: ${produzido} ${item.unidade}.`
    );
  }

  const dayStart = new Date(order.date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const [total, pendentes] = await Promise.all([
    prisma.productionOrder.count({ where: { empresaId: order.empresaId, date: { gte: dayStart, lt: dayEnd } } }),
    prisma.productionOrder.count({ where: { empresaId: order.empresaId, date: { gte: dayStart, lt: dayEnd }, status: { not: "CONCLUIDO" } } }),
  ]);
  if (total > 0 && pendentes === 0) {
    const managerIds = await getStoreManagers(order.empresaId);
    await notifyProducaoUsers(managerIds, "PRODUCAO_DIA_CONCLUIDO", "Produção do dia concluída", `${total} de ${total} produções concluídas.`);
  }
}

/** Lança manualmente um movimento de estoque pronto (saldo do turno anterior,
 * ajuste ou perda) — seção 14. */
export async function lancarProductionStockMovement(
  productionItemId: string,
  empresaId: string,
  userId: string,
  type: "SALDO_ANTERIOR" | "AJUSTE" | "PERDA",
  quantidade: number,
  motivo?: string | null
) {
  const delta = type === "PERDA" ? -Math.abs(quantidade) : quantidade;
  return prisma.$transaction(async (tx) => {
    const stock = await tx.productionStock.upsert({
      where: { productionItemId },
      update: { saldoAtual: { increment: delta } },
      create: { productionItemId, empresaId, saldoAtual: Math.max(delta, 0) },
    });
    await tx.productionStockMovement.create({
      data: { productionItemId, empresaId, type, quantidade: delta, saldoApos: stock.saldoAtual, motivo: motivo ?? null, createdById: userId },
    });
    return stock;
  });
}

export type ProducaoDashboardFiltros = {
  categoria?: string;
  responsavelId?: string;
  from?: Date;
  to?: Date;
};

export async function getProducaoDashboardData(empresaIds: string[], date: Date, filtros: ProducaoDashboardFiltros = {}) {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const where: Prisma.ProductionOrderWhereInput = {
    empresaId: { in: empresaIds },
    date: { gte: dayStart, lt: dayEnd },
    ...(filtros.categoria ? { productionItem: { categoryId: filtros.categoria } } : {}),
    ...(filtros.responsavelId ? { responsavelId: filtros.responsavelId } : {}),
  };

  const orders = await prisma.productionOrder.findMany({ where, select: { status: true, prazo: true } });

  let concluidas = 0;
  let pendentes = 0;
  let atrasadas = 0;
  for (const order of orders) {
    const status = effectiveProductionStatus({ prazo: order.prazo, status: order.status });
    if (status === "CONCLUIDO") concluidas++;
    else if (status === "ATRASADO") atrasadas++;
    else pendentes++;
  }

  const programadas = orders.length;
  const percentConcluido = programadas > 0 ? Math.round((concluidas / programadas) * 100) : 0;

  return { programadas, concluidas, pendentes, atrasadas, percentConcluido };
}
