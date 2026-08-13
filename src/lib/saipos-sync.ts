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

  const log = await prisma.saiposSyncLog.create({
    data: { empresaId: empresa.id, status: "EM_ANDAMENTO" },
  });

  const token = decryptSecret(empresa.saiposApiToken);
  const result = await fetchSaiposSales(token, range);

  if (!result.ok) {
    await prisma.saiposSyncLog.update({
      where: { id: log.id },
      data: { status: "ERRO", errorMessage: result.error, finishedAt: new Date() },
    });
    return { ok: false, error: result.error };
  }

  for (const record of result.sales) {
    const data = toSaiposSaleData(empresa.id, record);
    await prisma.saiposSale.upsert({
      where: { empresaId_saiposId: { empresaId: empresa.id, saiposId: data.saiposId } },
      create: data,
      update: data,
    });
  }

  await prisma.$transaction([
    prisma.saiposSyncLog.update({
      where: { id: log.id },
      data: { status: "SUCESSO", recordsSynced: result.sales.length, finishedAt: new Date() },
    }),
    prisma.empresa.update({ where: { id: empresa.id }, data: { saiposLastSyncAt: new Date() } }),
  ]);

  return { ok: true, recordsSynced: result.sales.length };
}
