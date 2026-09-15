import { prisma } from "@/lib/prisma";

/**
 * Marketing > Parcerias. quantidadeUtilizada/vendas/gasto não são mais
 * colunas fixas de MarketingPartner — cada parceiro tem 0+ lançamentos
 * (MarketingPartnerEntry, com data própria) e os números "do parceiro" são
 * a SOMA dos lançamentos dentro de um período (ou de todos, sem filtro). Ver
 * prisma/migrations/20260915140000_marketing_partner_entries. Compartilhado
 * entre a carga inicial da página (src/app/portal/marketing/parcerias/
 * page.tsx) e a rota usada pelo refresh do client
 * (src/app/api/marketing/partners/route.ts) pra não duplicar a mesma soma
 * em dois lugares.
 */
export type PartnerEntryTotals = { quantidadeUtilizada: number; vendas: number; gasto: number };

export function sumPartnerEntries(entries: PartnerEntryTotals[]): PartnerEntryTotals {
  return entries.reduce(
    (acc, e) => ({
      quantidadeUtilizada: acc.quantidadeUtilizada + e.quantidadeUtilizada,
      vendas: acc.vendas + e.vendas,
      gasto: acc.gasto + e.gasto,
    }),
    { quantidadeUtilizada: 0, vendas: 0, gasto: 0 }
  );
}

/**
 * `period` ausente = soma TODOS os lançamentos do parceiro (total acumulado
 * desde sempre). Passe `{ from, to }` (mesmo formato de
 * `resolveRollingPeriod`, ver src/lib/periods.ts) pra restringir a soma a um
 * período — o que a <PeriodFilterBar> da tela de Parcerias usa (ambos os
 * pontos de entrada, page.tsx e a rota GET, sempre passam um período; o
 * parâmetro fica opcional aqui só pra manter a função reutilizável).
 */
export async function findPartnersWithTotals(empresaIds: string[], period?: { from: Date; to: Date }) {
  const partners = await prisma.marketingPartner.findMany({
    where: { empresaId: { in: empresaIds } },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { name: true } },
      empresa: { select: { name: true, color: true } },
      entries: {
        where: period ? { date: { gte: period.from, lte: period.to } } : undefined,
        select: { quantidadeUtilizada: true, vendas: true, gasto: true },
      },
    },
  });

  const withTotals = partners.map(({ entries, ...partner }) => ({ ...partner, ...sumPartnerEntries(entries) }));
  withTotals.sort((a, b) => b.vendas - a.vendas);
  return withTotals;
}
