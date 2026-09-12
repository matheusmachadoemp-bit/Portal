import { prisma } from "@/lib/prisma";

export type GarcomRanking = {
  id: string;
  name: string;
  photo: string | null;
  totalVendido: number;
  qtdItens: number;
  mesas: number;
  bebidas: number;
  sobremesas: number;
  ticketMedio: number;
  itensPorMesa: number;
};

/**
 * Ranking de desempenho por garçom no período [from, to] — junta vendas
 * lançadas no próprio Portal (Sale, com item a item) com vendas importadas
 * do relatório "Desempenho por garçom" do Saipos (ImportedGarcomItem, que
 * não tem separação por mesa/pedido — por isso não entram em "Mesas
 * atendidas"/"Ticket médio", só em "Total vendido"/"Itens vendidos").
 */
export async function loadGarcomRanking(empresaIds: string[], from: Date, to: Date): Promise<GarcomRanking[]> {
  const [sales, importedItems] = await Promise.all([
    prisma.sale.findMany({
      where: { empresaId: { in: empresaIds }, dateTime: { gte: from, lte: to }, garcomId: { not: null } },
      include: { items: true, garcom: { select: { id: true, name: true, photoUrl: true } } },
    }),
    prisma.importedGarcomItem.findMany({
      where: { empresaId: { in: empresaIds }, periodTo: { gte: from, lte: to } },
      select: { employeeId: true, garcomNome: true, categoria: true, quantidade: true, faturamento: true },
    }),
  ]);

  const byGarcom = new Map<
    string,
    { name: string; photo: string | null; totalVendido: number; qtdItens: number; mesas: number; bebidas: number; sobremesas: number }
  >();

  for (const sale of sales) {
    if (!sale.garcomId || !sale.garcom) continue;
    const cur = byGarcom.get(sale.garcomId) ?? {
      name: sale.garcom.name,
      photo: sale.garcom.photoUrl,
      totalVendido: 0,
      qtdItens: 0,
      mesas: 0,
      bebidas: 0,
      sobremesas: 0,
    };
    cur.totalVendido += sale.valorTotal;
    cur.mesas += 1;
    for (const item of sale.items) {
      cur.qtdItens += item.quantidade;
      if (item.categoria === "BEBIDA" || item.categoria === "DRINK") cur.bebidas += item.quantidade;
      if (item.categoria === "SOBREMESA") cur.sobremesas += item.quantidade;
    }
    byGarcom.set(sale.garcomId, cur);
  }

  for (const item of importedItems) {
    const key = item.employeeId ?? item.garcomNome;
    const cur = byGarcom.get(key) ?? {
      name: item.garcomNome,
      photo: null,
      totalVendido: 0,
      qtdItens: 0,
      mesas: 0,
      bebidas: 0,
      sobremesas: 0,
    };
    cur.totalVendido += item.faturamento;
    cur.qtdItens += item.quantidade;
    if (item.categoria === "BEBIDA" || item.categoria === "DRINK") cur.bebidas += item.quantidade;
    if (item.categoria === "SOBREMESA") cur.sobremesas += item.quantidade;
    byGarcom.set(key, cur);
  }

  return [...byGarcom.entries()]
    .map(([id, g]) => ({
      id,
      ...g,
      ticketMedio: g.mesas ? g.totalVendido / g.mesas : 0,
      itensPorMesa: g.mesas ? g.qtdItens / g.mesas : 0,
    }))
    .sort((a, b) => b.totalVendido - a.totalVendido);
}
