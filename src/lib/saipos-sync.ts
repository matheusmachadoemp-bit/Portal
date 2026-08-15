import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/vault";
import { fetchSaiposSales, type SaiposSaleRecord } from "@/lib/saipos-client";
import { isSaiposSaleCanceled, toSaiposSaleData, toSaleData } from "@/lib/saipos-mapper";
import { mapLimit } from "@/lib/concurrency";
import type { Empresa } from "@prisma/client";

export type SaiposSyncOutcome = { ok: true; recordsSynced: number } | { ok: false; error: string };

const UPSERT_CONCURRENCY = 10;

/**
 * Sincroniza as vendas da Saipos de uma empresa para um intervalo de datas
 * (máx. 15 dias, conforme limite da API). Faz upsert por `saiposId` para
 * ser seguro re-executar sobre o mesmo período. Qualquer falha inesperada é
 * capturada e registrada no log, para nunca deixar uma sincronização "presa"
 * em EM_ANDAMENTO.
 */
export async function syncEmpresaSaiposSales(
  empresa: Pick<Empresa, "id" | "saiposApiToken">,
  range: { start: Date; end: Date }
): Promise<SaiposSyncOutcome> {
  if (!empresa.saiposApiToken) {
    return { ok: false, error: "Token da Saipos não configurado para esta loja." };
  }

  const log = await prisma.saiposSyncLog.create({
    data: { empresaId: empresa.id, status: "EM_ANDAMENTO" },
  });

  try {
    // Limpa registros órfãos de uma versão anterior do mapeamento, em que o
    // identificador da venda não era extraído corretamente.
    await prisma.saiposSale.deleteMany({ where: { empresaId: empresa.id, saiposId: "undefined" } });

    const token = decryptSecret(empresa.saiposApiToken);
    const result = await fetchSaiposSales(token, range);

    if (!result.ok) {
      await prisma.saiposSyncLog.update({
        where: { id: log.id },
        data: { status: "ERRO", errorMessage: result.error, finishedAt: new Date() },
      });
      return { ok: false, error: result.error };
    }

    const canceled = result.sales.filter(isSaiposSaleCanceled);
    const active = result.sales.filter((r) => !isSaiposSaleCanceled(r));

    await removeCanceledSales(empresa.id, canceled);
    await mapLimit(active, UPSERT_CONCURRENCY, (record) => upsertSale(empresa.id, record));

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
    const message = err instanceof Error ? err.message : String(err);
    await prisma.saiposSyncLog.update({
      where: { id: log.id },
      data: { status: "ERRO", errorMessage: message, finishedAt: new Date() },
    });
    return { ok: false, error: message };
  }
}

async function upsertSale(empresaId: string, record: SaiposSaleRecord) {
  const data = toSaiposSaleData(empresaId, record);
  const saleData = toSaleData(empresaId, record);

  await Promise.all([
    prisma.saiposSale.upsert({
      where: { empresaId_saiposId: { empresaId, saiposId: data.saiposId } },
      create: data,
      update: data,
    }),
    prisma.sale.upsert({
      where: { empresaId_saiposSaleId: { empresaId, saiposSaleId: saleData.saiposSaleId } },
      create: saleData,
      update: saleData,
    }),
  ]);
}

/**
 * Remove vendas que já haviam sido sincronizadas anteriormente mas foram
 * canceladas na Saipos depois — sem isso, o faturamento ficaria inflado com
 * vendas que não existem mais.
 */
async function removeCanceledSales(empresaId: string, canceledRecords: SaiposSaleRecord[]) {
  if (canceledRecords.length === 0) return;
  const saiposIds = canceledRecords.map((r) => String(r.id_sale));

  await prisma.$transaction([
    prisma.saiposSale.deleteMany({ where: { empresaId, saiposId: { in: saiposIds } } }),
    prisma.sale.deleteMany({ where: { empresaId, saiposSaleId: { in: saiposIds } } }),
  ]);
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
    where: { empresaId, shiftDate: { gte: startOfDayUtc(range.start), lte: range.end } },
    select: { shiftDate: true, channel: true, valorTotal: true },
  });

  const byDay = new Map<string, typeof sales>();
  for (const sale of sales) {
    const key = startOfDayUtc(sale.shiftDate).toISOString();
    const list = byDay.get(key) ?? [];
    list.push(sale);
    byDay.set(key, list);
  }

  await mapLimit([...byDay.entries()], UPSERT_CONCURRENCY, async ([dayKey, daySales]) => {
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
  });
}
