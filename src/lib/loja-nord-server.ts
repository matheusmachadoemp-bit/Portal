import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/tarefas-server";
import type { LojaNordTransactionKind } from "@prisma/client";

export type LojaNordActionResult = { ok: true } | { ok: false; error: string };

/** Saldo atual do colaborador — sempre a soma assinada do ledger, nunca um campo cacheado. */
export async function getSaldoAtual(userId: string): Promise<number> {
  const agg = await prisma.lojaNordPointTransaction.aggregate({
    where: { userId },
    _sum: { pontos: true },
  });
  return agg._sum.pontos ?? 0;
}

/** Total de pontos já ganhos (positivos) ao longo da vida — base do nível de reconhecimento, não cai ao resgatar. */
export async function getPontosGanhosTotal(userId: string): Promise<number> {
  const agg = await prisma.lojaNordPointTransaction.aggregate({
    where: { userId, pontos: { gt: 0 } },
    _sum: { pontos: true },
  });
  return agg._sum.pontos ?? 0;
}

export async function getPontosNoPeriodo(userId: string, start: Date, end: Date, sinal: "positivo" | "negativo") {
  const agg = await prisma.lojaNordPointTransaction.aggregate({
    where: {
      userId,
      createdAt: { gte: start, lte: end },
      pontos: sinal === "positivo" ? { gt: 0 } : { lt: 0 },
    },
    _sum: { pontos: true },
  });
  return agg._sum.pontos ?? 0;
}

/** Pontos já debitados em resgates que ainda aguardam aprovação (reservados, podem voltar se recusado). */
export async function getPontosPendentesAprovacao(userId: string): Promise<number> {
  const agg = await prisma.lojaNordRedemption.aggregate({
    where: { userId, status: "AGUARDANDO_APROVACAO" },
    _sum: { pontos: true },
  });
  return agg._sum.pontos ?? 0;
}

/**
 * Cria uma solicitação de resgate: valida saldo, estoque e limite por
 * colaborador, debita os pontos imediatamente (ficam "reservados" até a
 * aprovação) e decrementa o estoque. Tudo numa transação de banco — ou tudo
 * acontece, ou nada acontece.
 */
export async function criarResgate(params: {
  userId: string;
  empresaId: string;
  rewardId: string;
}): Promise<LojaNordActionResult & { redemptionId?: string }> {
  const { userId, empresaId, rewardId } = params;

  const reward = await prisma.lojaNordReward.findUnique({ where: { id: rewardId } });
  if (!reward || !reward.active) return { ok: false, error: "Brinde não encontrado ou indisponível." };
  if (reward.empresaIds.length > 0 && !reward.empresaIds.includes(empresaId)) {
    return { ok: false, error: "Este brinde não está disponível para a sua loja." };
  }
  const now = new Date();
  if (reward.disponivelDe && now < reward.disponivelDe) return { ok: false, error: "Este brinde ainda não está disponível." };
  if (reward.disponivelAte && now > reward.disponivelAte) return { ok: false, error: "O período de disponibilidade deste brinde já encerrou." };
  if (reward.estoque !== null && reward.estoque <= 0) return { ok: false, error: "Brinde sem estoque disponível." };

  const saldo = await getSaldoAtual(userId);
  if (saldo < reward.pontos) return { ok: false, error: "Saldo de pontos insuficiente." };

  if (reward.limitePorColaborador !== null) {
    const jaResgatados = await prisma.lojaNordRedemption.count({
      where: { userId, rewardId, status: { notIn: ["RECUSADO", "CANCELADO"] } },
    });
    if (jaResgatados >= reward.limitePorColaborador) {
      return { ok: false, error: "Você já atingiu o limite de resgates para este brinde." };
    }
  }

  const status = reward.exigeAprovacao ? "AGUARDANDO_APROVACAO" : "APROVADO";

  const redemption = await prisma.$transaction(async (tx) => {
    if (reward.estoque !== null) {
      const updated = await tx.lojaNordReward.updateMany({
        where: { id: rewardId, estoque: { gte: 1 } },
        data: { estoque: { decrement: 1 } },
      });
      if (updated.count === 0) throw new Error("SEM_ESTOQUE");
    }

    const created = await tx.lojaNordRedemption.create({
      data: { userId, empresaId, rewardId, pontos: reward.pontos, status },
    });

    await tx.lojaNordPointTransaction.create({
      data: {
        userId,
        empresaId,
        kind: "RESGATE",
        pontos: -reward.pontos,
        origem: "Loja Nord",
        descricao: `Resgate: ${reward.nome}`,
        redemptionId: created.id,
      },
    });

    return created;
  }).catch((err) => {
    if (err instanceof Error && err.message === "SEM_ESTOQUE") return null;
    throw err;
  });

  if (!redemption) return { ok: false, error: "Brinde sem estoque disponível." };

  await notifyUser(
    userId,
    "LOJA_NORD_RESGATE_SOLICITADO",
    "Resgate solicitado",
    `Seu resgate de "${reward.nome}" foi registrado e está ${reward.exigeAprovacao ? "aguardando aprovação" : "aprovado"}.`,
    null
  );

  return { ok: true, redemptionId: redemption.id };
}

/** Cancela um resgate ainda não aprovado (o próprio colaborador) e devolve os pontos. */
export async function cancelarResgate(redemptionId: string, userId: string): Promise<LojaNordActionResult> {
  const redemption = await prisma.lojaNordRedemption.findUnique({ where: { id: redemptionId }, include: { reward: true } });
  if (!redemption || redemption.userId !== userId) return { ok: false, error: "Resgate não encontrado." };
  if (redemption.status !== "AGUARDANDO_APROVACAO") return { ok: false, error: "Só é possível cancelar resgates aguardando aprovação." };

  await estornarResgate(redemption.id, redemption.userId, redemption.empresaId, redemption.pontos, redemption.reward.nome, redemption.rewardId, "CANCELADO");
  return { ok: true };
}

/** Aprova um resgate (gerente/proprietário). */
export async function aprovarResgate(redemptionId: string, aprovadoPorId: string, dataPrevista?: Date): Promise<LojaNordActionResult> {
  const redemption = await prisma.lojaNordRedemption.findUnique({ where: { id: redemptionId }, include: { reward: true } });
  if (!redemption) return { ok: false, error: "Resgate não encontrado." };
  if (redemption.status !== "AGUARDANDO_APROVACAO") return { ok: false, error: "Este resgate já foi processado." };

  await prisma.lojaNordRedemption.update({
    where: { id: redemptionId },
    data: { status: "APROVADO", aprovadoPorId, dataPrevista: dataPrevista ?? null },
  });

  await notifyUser(
    redemption.userId,
    "LOJA_NORD_RESGATE_APROVADO",
    "Resgate aprovado!",
    `Seu resgate de "${redemption.reward.nome}" foi aprovado.`,
    null
  );
  return { ok: true };
}

/** Recusa um resgate (gerente/proprietário) — exige justificativa e devolve os pontos. */
export async function recusarResgate(redemptionId: string, aprovadoPorId: string, motivo: string): Promise<LojaNordActionResult> {
  if (!motivo.trim()) return { ok: false, error: "Informe uma justificativa para a recusa." };
  const redemption = await prisma.lojaNordRedemption.findUnique({ where: { id: redemptionId }, include: { reward: true } });
  if (!redemption) return { ok: false, error: "Resgate não encontrado." };
  if (redemption.status !== "AGUARDANDO_APROVACAO") return { ok: false, error: "Este resgate já foi processado." };

  await prisma.lojaNordRedemption.update({
    where: { id: redemptionId },
    data: { status: "RECUSADO", aprovadoPorId, motivoRecusa: motivo },
  });
  await estornarResgate(redemption.id, redemption.userId, redemption.empresaId, redemption.pontos, redemption.reward.nome, redemption.rewardId, null);

  await notifyUser(
    redemption.userId,
    "LOJA_NORD_RESGATE_RECUSADO",
    "Resgate recusado",
    `Seu resgate de "${redemption.reward.nome}" foi recusado: ${motivo}. Os pontos foram devolvidos ao seu saldo.`,
    null
  );
  return { ok: true };
}

/** Devolve os pontos de um resgate recusado/cancelado e repõe o estoque. Se `overrideStatus` vier, também atualiza o status (usado pelo cancelamento). */
async function estornarResgate(
  redemptionId: string,
  userId: string,
  empresaId: string,
  pontos: number,
  rewardName: string,
  rewardId: string,
  overrideStatus: "CANCELADO" | null
) {
  await prisma.$transaction(async (tx) => {
    if (overrideStatus) {
      await tx.lojaNordRedemption.update({ where: { id: redemptionId }, data: { status: overrideStatus } });
    }
    await tx.lojaNordPointTransaction.create({
      data: {
        userId,
        empresaId,
        kind: "ESTORNO",
        pontos,
        origem: "Loja Nord",
        descricao: `Estorno: ${rewardName}`,
        redemptionId,
      },
    });
    const reward = await tx.lojaNordReward.findUnique({ where: { id: rewardId }, select: { estoque: true } });
    if (reward?.estoque !== null && reward?.estoque !== undefined) {
      await tx.lojaNordReward.update({ where: { id: rewardId }, data: { estoque: { increment: 1 } } });
    }
  });
}

export async function marcarDisponivel(redemptionId: string): Promise<LojaNordActionResult> {
  const redemption = await prisma.lojaNordRedemption.findUnique({ where: { id: redemptionId }, include: { reward: true } });
  if (!redemption) return { ok: false, error: "Resgate não encontrado." };
  if (redemption.status !== "APROVADO") return { ok: false, error: "Só é possível marcar como disponível um resgate aprovado." };

  await prisma.lojaNordRedemption.update({ where: { id: redemptionId }, data: { status: "DISPONIVEL_RETIRADA" } });
  await notifyUser(
    redemption.userId,
    "LOJA_NORD_BRINDE_DISPONIVEL",
    "Brinde disponível para retirada",
    `"${redemption.reward.nome}" já está disponível para você retirar.`,
    null
  );
  return { ok: true };
}

export async function confirmarEntrega(redemptionId: string): Promise<LojaNordActionResult> {
  const redemption = await prisma.lojaNordRedemption.findUnique({ where: { id: redemptionId }, include: { reward: true } });
  if (!redemption) return { ok: false, error: "Resgate não encontrado." };
  if (redemption.status !== "DISPONIVEL_RETIRADA") return { ok: false, error: "Este resgate ainda não está disponível para retirada." };

  await prisma.lojaNordRedemption.update({ where: { id: redemptionId }, data: { status: "ENTREGUE" } });
  await notifyUser(redemption.userId, "LOJA_NORD_BRINDE_ENTREGUE", "Brinde entregue", `"${redemption.reward.nome}" foi entregue. Aproveite!`, null);
  return { ok: true };
}

/**
 * Lança uma bonificação ou ajuste manual de pontos (gerente/proprietário).
 * Ajustes negativos nunca podem deixar o saldo abaixo de zero.
 */
export async function lancarAjusteManual(params: {
  userId: string;
  empresaId: string;
  pontos: number;
  kind: Extract<LojaNordTransactionKind, "BONIFICACAO" | "AJUSTE_POSITIVO" | "AJUSTE_NEGATIVO">;
  descricao: string;
  justificativa: string;
  criadoPorId: string;
}): Promise<LojaNordActionResult> {
  const { userId, empresaId, kind, descricao, justificativa, criadoPorId } = params;
  if (!justificativa.trim()) return { ok: false, error: "Todo ajuste manual exige uma justificativa." };
  if (params.pontos <= 0) return { ok: false, error: "Informe uma quantidade de pontos maior que zero." };

  const sinal = kind === "AJUSTE_NEGATIVO" ? -1 : 1;
  const pontos = sinal * params.pontos;

  if (sinal < 0) {
    const saldo = await getSaldoAtual(userId);
    if (saldo + pontos < 0) return { ok: false, error: "Este ajuste deixaria o saldo do colaborador negativo." };
  }

  await prisma.lojaNordPointTransaction.create({
    data: { userId, empresaId, kind, pontos, origem: "Gerente", descricao, justificativa, criadoPorId },
  });

  await notifyUser(
    userId,
    pontos > 0 ? "LOJA_NORD_PONTOS_RECEBIDOS" : "LOJA_NORD_PONTOS_REMOVIDOS",
    pontos > 0 ? "Você recebeu pontos!" : "Ajuste de pontos",
    `${descricao} (${pontos > 0 ? "+" : ""}${pontos} pontos). Motivo: ${justificativa}`,
    null
  );
  return { ok: true };
}
