import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/vault";
import { getIfoodAccessToken, fetchIfoodSales } from "@/lib/ifood-client";
import { toIfoodOrderData } from "@/lib/ifood-mapper";
import { notifySyncFailure } from "@/lib/sync-notifications";
import type { Empresa } from "@prisma/client";

export type IfoodSyncOutcome = { ok: true; recordsSynced: number } | { ok: false; error: string };

/**
 * Atualiza em lote os pedidos do iFood já existentes com uma única query SQL
 * (`UPDATE ... FROM UNNEST(...)`) — mesmo padrão (e mesmo motivo) de
 * `bulkUpdateSaiposSales` em `saipos-sync.ts`: evita várias operações
 * sequenciais dentro de um `$transaction` interativo, que já estourou o
 * timeout padrão de 5s do Prisma contra o Neon quando o volume de linhas
 * repetidas cresceu.
 */
async function bulkUpdateIfoodOrders(empresaId: string, rows: ReturnType<typeof toIfoodOrderData>[]): Promise<void> {
  if (rows.length === 0) return;

  const ifoodOrderIds = rows.map((r) => r.ifoodOrderId);
  const merchantIds = rows.map((r) => r.merchantId);
  const orderDates = rows.map((r) => r.orderDate);
  const channels = rows.map((r) => r.channel);
  const platforms = rows.map((r) => r.platform);
  const formasPagamento = rows.map((r) => r.formaPagamento);
  const valoresTotal = rows.map((r) => r.valorTotal);
  const cancelados = rows.map((r) => r.cancelado);
  const raws = rows.map((r) => JSON.stringify(r.raw ?? null));

  await prisma.$executeRaw`
    UPDATE "IfoodOrder" AS s
    SET
      "merchantId" = v.merchant_id,
      "orderDate" = v.order_date,
      "channel" = v.channel::"SaleChannel",
      "platform" = v.platform::"SalePlatform",
      "formaPagamento" = v.forma_pagamento::"PaymentMethod",
      "valorTotal" = v.valor_total,
      "cancelado" = v.cancelado,
      "raw" = v.raw_txt::jsonb
    FROM UNNEST(
      ${ifoodOrderIds}::text[], ${merchantIds}::text[], ${orderDates}::timestamp[],
      ${channels}::text[], ${platforms}::text[], ${formasPagamento}::text[],
      ${valoresTotal}::float8[], ${cancelados}::boolean[], ${raws}::text[]
    ) AS v(ifood_order_id, merchant_id, order_date, channel, platform, forma_pagamento, valor_total, cancelado, raw_txt)
    WHERE s."empresaId" = ${empresaId} AND s."ifoodOrderId" = v.ifood_order_id
  `;
}

/**
 * Sincroniza os pedidos do iFood de uma empresa para um intervalo de datas.
 * Faz upsert por `ifoodOrderId` (seguro re-executar sobre o mesmo período).
 *
 * FASE 1: só grava em `IfoodOrder` (staging) — não alimenta `Sale`/
 * `SaleItem`/`SalesEntry` ainda (ver comentário no `schema.prisma` sobre
 * `IfoodOrder`). Mesmo formato de retorno/log/notificação de falha que
 * `syncEmpresaSaiposSales`, pra a rota de sync e o cron reaproveitarem o
 * mesmo padrão já testado.
 */
export async function syncEmpresaIfoodOrders(
  empresa: Pick<Empresa, "id" | "ifoodClientId" | "ifoodClientSecretCipher" | "ifoodMerchantId">,
  range: { start: Date; end: Date }
): Promise<IfoodSyncOutcome> {
  if (!empresa.ifoodClientId || !empresa.ifoodClientSecretCipher || !empresa.ifoodMerchantId) {
    return { ok: false, error: "Credenciais do iFood não configuradas para esta loja." };
  }

  let log: { id: string } | null = null;
  try {
    log = await prisma.ifoodSyncLog.create({
      data: { empresaId: empresa.id, status: "EM_ANDAMENTO" },
    });

    let clientSecret: string;
    try {
      clientSecret = decryptSecret(empresa.ifoodClientSecretCipher);
    } catch (err) {
      throw new Error(
        `Não foi possível decifrar o clientSecret salvo — tente cadastrar a credencial novamente em Configurações. (Detalhe técnico: ${errorMessageOf(err)})`
      );
    }
    if (!clientSecret) {
      throw new Error(
        "O clientSecret salvo está em um formato inválido ou corrompido — tente cadastrar a credencial novamente em Configurações."
      );
    }

    const tokenResult = await getIfoodAccessToken(empresa.ifoodClientId, clientSecret);
    if (!tokenResult.ok) {
      await prisma.ifoodSyncLog.update({
        where: { id: log.id },
        data: { status: "ERRO", errorMessage: tokenResult.error, finishedAt: new Date() },
      });
      await notifySyncFailure({ empresaId: empresa.id, integration: "IFOOD", errorMessage: tokenResult.error });
      return { ok: false, error: tokenResult.error };
    }

    const result = await fetchIfoodSales(tokenResult.accessToken, empresa.ifoodMerchantId, range);
    if (!result.ok) {
      await prisma.ifoodSyncLog.update({
        where: { id: log.id },
        data: { status: "ERRO", errorMessage: result.error, finishedAt: new Date() },
      });
      await notifySyncFailure({ empresaId: empresa.id, integration: "IFOOD", errorMessage: result.error });
      return { ok: false, error: result.error };
    }

    const ordersData = result.sales.map((r) => toIfoodOrderData(empresa.id, empresa.ifoodMerchantId as string, r));

    if (ordersData.length > 0) {
      const existing = await prisma.ifoodOrder.findMany({
        where: { empresaId: empresa.id, ifoodOrderId: { in: ordersData.map((d) => d.ifoodOrderId) } },
        select: { ifoodOrderId: true },
      });
      const existingIds = new Set(existing.map((e) => e.ifoodOrderId));
      const toCreate = ordersData.filter((d) => !existingIds.has(d.ifoodOrderId));
      const toUpdate = ordersData.filter((d) => existingIds.has(d.ifoodOrderId));

      if (toCreate.length > 0) {
        await prisma.ifoodOrder.createMany({ data: toCreate, skipDuplicates: true });
      }
      if (toUpdate.length > 0) {
        await bulkUpdateIfoodOrders(empresa.id, toUpdate);
      }
    }

    await prisma.$transaction([
      prisma.ifoodSyncLog.update({
        where: { id: log.id },
        data: { status: "SUCESSO", recordsSynced: result.sales.length, finishedAt: new Date() },
      }),
      prisma.empresa.update({ where: { id: empresa.id }, data: { ifoodLastSyncAt: new Date() } }),
    ]);

    return { ok: true, recordsSynced: result.sales.length };
  } catch (err) {
    const message = errorMessageOf(err);
    if (log) {
      await prisma.ifoodSyncLog
        .update({ where: { id: log.id }, data: { status: "ERRO", errorMessage: message, finishedAt: new Date() } })
        .catch(() => {});
    }
    await notifySyncFailure({ empresaId: empresa.id, integration: "IFOOD", errorMessage: message });
    return { ok: false, error: message };
  }
}

function errorMessageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Erro inesperado ao sincronizar com o iFood.";
}
