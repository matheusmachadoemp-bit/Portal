import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/vault";
import { fetchSaiposSales } from "@/lib/saipos-client";
import { toSaiposSaleData } from "@/lib/saipos-mapper";
import type { Empresa } from "@prisma/client";

export type SaiposSyncOutcome = { ok: true; recordsSynced: number } | { ok: false; error: string };

/**
 * Sincroniza as vendas da Saipos de uma empresa para um intervalo de datas
 * (máx. 15 dias, conforme limite da API). Faz upsert por `saiposId` para
 * ser seguro re-executar sobre o mesmo período.
 */
export async function syncEmpresaSaiposSales(
  empresa: Pick<Empresa, "id" | "saiposApiToken">,
  range: { start: Date; end: Date }
): Promise<SaiposSyncOutcome> {
  if (!empresa.saiposApiToken) {
    return { ok: false, error: "Token da Saipos não configurado para esta loja." };
  }

  // A partir daqui qualquer etapa pode falhar de formas inesperadas (token
  // salvo corrompido, API da Saipos mudando o formato da resposta, banco
  // indisponível etc.). Tudo fica dentro de um try/catch único para que o
  // usuário sempre receba uma mensagem legível — nunca um erro genérico —
  // e para que o SaiposSyncLog nunca fique preso em EM_ANDAMENTO.
  let log: { id: string } | null = null;
  try {
    log = await prisma.saiposSyncLog.create({
      data: { empresaId: empresa.id, status: "EM_ANDAMENTO" },
    });

    // Limpa registros órfãos de uma versão anterior do mapeamento, em que o
    // identificador da venda não era extraído corretamente.
    await prisma.saiposSale.deleteMany({ where: { empresaId: empresa.id, saiposId: "undefined" } });

    let token: string;
    try {
      token = decryptSecret(empresa.saiposApiToken);
    } catch (err) {
      throw new Error(
        `Não foi possível decifrar o token salvo — tente cadastrar o token novamente em Configurações. (Detalhe técnico: ${errorMessageOf(err)})`
      );
    }
    if (!token) {
      throw new Error(
        "O token salvo está em um formato inválido ou corrompido — tente cadastrar o token novamente em Configurações."
      );
    }

    const result = await fetchSaiposSales(token, range);

    if (!result.ok) {
      await prisma.saiposSyncLog.update({
        where: { id: log.id },
        data: { status: "ERRO", errorMessage: result.error, finishedAt: new Date() },
      });
      return { ok: false, error: result.error };
    }

    // Vendas canceladas são gravadas (não descartadas) para alimentar as
    // telas de Acompanhamento de Vendas; ficam de fora dos agregados de
    // faturamento em syncSalesEntriesFromSaipos abaixo.
    const salesData = result.sales.map((r) => toSaiposSaleData(empresa.id, r));

    if (salesData.length > 0) {
      const existing = await prisma.saiposSale.findMany({
        where: { empresaId: empresa.id, saiposId: { in: salesData.map((d) => d.saiposId) } },
        select: { saiposId: true },
      });
      const existingIds = new Set(existing.map((e) => e.saiposId));
      const toCreate = salesData.filter((d) => !existingIds.has(d.saiposId));
      const toUpdate = salesData.filter((d) => existingIds.has(d.saiposId));

      if (toCreate.length > 0) {
        await prisma.saiposSale.createMany({ data: toCreate, skipDuplicates: true });
      }
      if (toUpdate.length > 0) {
        await prisma.$transaction(
          toUpdate.map((data) =>
            prisma.saiposSale.update({
              where: { empresaId_saiposId: { empresaId: empresa.id, saiposId: data.saiposId } },
              data,
            })
          )
        );
      }
    }

    await syncSalesEntriesFromSaipos(empresa.id, range);

    await prisma.$transaction([
      prisma.saiposSyncLog.update({
        where: { id: log.id },
        data: { status: "SUCESSO", recordsSynced: result.sales.length, finishedAt: new Date() },
      }),
      prisma.empresa.update({ where: { id: empresa.id }, data: { saiposLastSyncAt: new Date() } }),
    ]);

    return { ok: true, recordsSynced: result.sales.length };
  } catch (err) {
    const message = errorMessageOf(err);
    if (log) {
      // Se até a atualização do log falhar (ex.: banco caiu no meio da
      // sincronização), não deixa esse erro secundário mascarar a mensagem
      // original — o log só fica preso em EM_ANDAMENTO nesse caso extremo.
      await prisma.saiposSyncLog
        .update({ where: { id: log.id }, data: { status: "ERRO", errorMessage: message, finishedAt: new Date() } })
        .catch(() => {});
    }
    return { ok: false, error: message };
  }
}

function errorMessageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Erro inesperado ao sincronizar com a Saipos.";
}

function startOfDayUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Recalcula o lançamento diário (SalesEntry) de cada dia do intervalo a
 * partir das vendas da Saipos já salvas, substituindo o lançamento manual
 * do dia (se houver) por um lançamento com origem "SAIPOS".
 */
async function syncSalesEntriesFromSaipos(empresaId: string, range: { start: Date; end: Date }) {
  const sales = await prisma.saiposSale.findMany({
    where: { empresaId, shiftDate: { gte: startOfDayUtc(range.start), lte: range.end }, cancelado: false },
    select: { shiftDate: true, channel: true, valorTotal: true },
  });

  const byDay = new Map<string, typeof sales>();
  for (const sale of sales) {
    const key = startOfDayUtc(sale.shiftDate).toISOString();
    const list = byDay.get(key) ?? [];
    list.push(sale);
    byDay.set(key, list);
  }

  for (const [dayKey, daySales] of byDay) {
    const day = new Date(dayKey);
    const faturamentoDelivery = daySales.filter((s) => s.channel === "DELIVERY").reduce((sum, s) => sum + s.valorTotal, 0);
    const faturamentoSalao = daySales.filter((s) => s.channel !== "DELIVERY").reduce((sum, s) => sum + s.valorTotal, 0);
    const pedidosDelivery = daySales.filter((s) => s.channel === "DELIVERY").length;
    const pedidosSalao = daySales.filter((s) => s.channel === "SALAO").length;
    const pedidosBalcao = daySales.filter((s) => s.channel === "BALCAO").length;

    const data = {
      faturamentoDelivery,
      faturamentoSalao,
      pedidosDelivery,
      pedidosSalao,
      pedidosBalcao,
      source: "SAIPOS" as const,
      createdById: null,
    };

    const existing = await prisma.salesEntry.findFirst({
      where: { empresaId, date: day, periodType: "DIARIO" },
      select: { id: true },
    });

    if (existing) {
      await prisma.salesEntry.update({ where: { id: existing.id }, data });
    } else {
      await prisma.salesEntry.create({ data: { empresaId, date: day, periodType: "DIARIO", ...data } });
    }
  }
}
