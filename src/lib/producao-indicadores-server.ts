import { prisma } from "@/lib/prisma";
import { compareProducedToPlanned } from "@/lib/producao";

type OrderRow = {
  id: string;
  necessidadePrevista: number;
  quantidadeSugerida: number;
  quantidadeAprovada: number | null;
  quantidadeProduzida: number | null;
  prazo: Date;
  horaFim: Date | null;
  date: Date;
  responsavelId: string | null;
  responsavel: { id: string; name: string } | null;
  productionItem: { id: string; name: string; unidade: string; ingredientId: string | null; ingredient: { precoAtual: number } | null };
};

export type IndicadoresData = {
  precisaoMedia: number;
  producaoExcedente: { count: number; valorEstimado: number };
  producaoInsuficiente: { count: number };
  desperdicioEstimado: number;
  producoesAtrasadas: number;
  percentNoPrazo: number;
  itensComMaiorVariacao: { name: string; unidade: string; diferencaMediaPercent: number }[];
  responsaveis: { id: string; name: string; concluidas: number; precisaoMedia: number }[];
  serieDiaria: { date: string; precisaoMedia: number; planejado: number; produzido: number }[];
};

export async function getIndicadoresData(empresaIds: string[], from: Date, to: Date, toleranciaAlertaPct = 10): Promise<IndicadoresData> {
  const orders = (await prisma.productionOrder.findMany({
    where: { empresaId: { in: empresaIds }, date: { gte: from, lte: to }, status: "CONCLUIDO" },
    select: {
      id: true,
      necessidadePrevista: true,
      quantidadeSugerida: true,
      quantidadeAprovada: true,
      quantidadeProduzida: true,
      prazo: true,
      horaFim: true,
      date: true,
      responsavelId: true,
      responsavel: { select: { id: true, name: true } },
      productionItem: { select: { id: true, name: true, unidade: true, ingredientId: true, ingredient: { select: { precoAtual: true } } } },
    },
  })) as OrderRow[];

  if (orders.length === 0) {
    return {
      precisaoMedia: 0,
      producaoExcedente: { count: 0, valorEstimado: 0 },
      producaoInsuficiente: { count: 0 },
      desperdicioEstimado: 0,
      producoesAtrasadas: 0,
      percentNoPrazo: 100,
      itensComMaiorVariacao: [],
      responsaveis: [],
      serieDiaria: [],
    };
  }

  let somaPrecisao = 0;
  let excedenteCount = 0;
  let excedenteValor = 0;
  let insuficienteCount = 0;
  let atrasadas = 0;
  const porItem = new Map<string, { name: string; unidade: string; soma: number; count: number }>();
  const porResponsavel = new Map<string, { id: string; name: string; concluidas: number; somaPrecisao: number }>();
  const porDia = new Map<string, { somaPrecisao: number; count: number; planejado: number; produzido: number }>();

  for (const order of orders) {
    const planejado = order.quantidadeAprovada ?? order.quantidadeSugerida;
    const produzido = order.quantidadeProduzida ?? 0;
    const { diferenca, diferencaPercent, alerta } = compareProducedToPlanned(planejado, produzido, toleranciaAlertaPct);
    const precisao = Math.max(0, 100 - Math.abs(diferencaPercent));
    somaPrecisao += precisao;

    if (alerta === "acima") {
      excedenteCount++;
      const precoUnidade = order.productionItem.ingredient?.precoAtual ?? 0;
      excedenteValor += diferenca * precoUnidade;
    }
    if (alerta === "abaixo") insuficienteCount++;
    if (order.horaFim && order.horaFim.getTime() > new Date(order.prazo).getTime()) atrasadas++;

    const itemKey = order.productionItem.id;
    const itemAcc = porItem.get(itemKey) ?? { name: order.productionItem.name, unidade: order.productionItem.unidade, soma: 0, count: 0 };
    itemAcc.soma += Math.abs(diferencaPercent);
    itemAcc.count += 1;
    porItem.set(itemKey, itemAcc);

    if (order.responsavelId && order.responsavel) {
      const respAcc = porResponsavel.get(order.responsavelId) ?? { id: order.responsavelId, name: order.responsavel.name, concluidas: 0, somaPrecisao: 0 };
      respAcc.concluidas += 1;
      respAcc.somaPrecisao += precisao;
      porResponsavel.set(order.responsavelId, respAcc);
    }

    const diaKey = order.date.toISOString().slice(0, 10);
    const diaAcc = porDia.get(diaKey) ?? { somaPrecisao: 0, count: 0, planejado: 0, produzido: 0 };
    diaAcc.somaPrecisao += precisao;
    diaAcc.count += 1;
    diaAcc.planejado += planejado;
    diaAcc.produzido += produzido;
    porDia.set(diaKey, diaAcc);
  }

  // Desperdício estimado: soma das perdas de estoque pronto no período, valorizada
  // pelo preço do insumo ligado (quando existir a ponte com a ficha técnica).
  const perdas = await prisma.productionStockMovement.findMany({
    where: { empresaId: { in: empresaIds }, type: "PERDA", createdAt: { gte: from, lte: to } },
    select: { quantidade: true, productionItem: { select: { ingredient: { select: { precoAtual: true } } } } },
  });
  const desperdicioEstimado = perdas.reduce((acc, p) => acc + Math.abs(p.quantidade) * (p.productionItem.ingredient?.precoAtual ?? 0), 0);

  return {
    precisaoMedia: Math.round(somaPrecisao / orders.length),
    producaoExcedente: { count: excedenteCount, valorEstimado: excedenteValor },
    producaoInsuficiente: { count: insuficienteCount },
    desperdicioEstimado,
    producoesAtrasadas: atrasadas,
    percentNoPrazo: Math.round(((orders.length - atrasadas) / orders.length) * 100),
    itensComMaiorVariacao: Array.from(porItem.values())
      .map((i) => ({ name: i.name, unidade: i.unidade, diferencaMediaPercent: Math.round(i.soma / i.count) }))
      .sort((a, b) => b.diferencaMediaPercent - a.diferencaMediaPercent)
      .slice(0, 5),
    responsaveis: Array.from(porResponsavel.values())
      .map((r) => ({ id: r.id, name: r.name, concluidas: r.concluidas, precisaoMedia: Math.round(r.somaPrecisao / r.concluidas) }))
      .sort((a, b) => b.concluidas - a.concluidas),
    serieDiaria: Array.from(porDia.entries())
      .map(([date, d]) => ({ date, precisaoMedia: Math.round(d.somaPrecisao / d.count), planejado: Math.round(d.planejado), produzido: Math.round(d.produzido) }))
      .sort((a, b) => (a.date < b.date ? -1 : 1)),
  };
}

export type ConsumoComparativoRow = {
  productionItemId: string;
  name: string;
  unidade: string;
  estoqueInicial: number;
  produzido: number;
  disponivel: number;
  consumoTeorico: number;
  saldoEsperado: number;
  saldoReal: number | null;
  diferenca: number | null;
};

/** Cruza produção com consumo teórico (baseado na previsão de vendas já
 * calculada no planejamento) — seção 24. Não exige schema novo: usa a
 * necessidade prevista já gravada em ProductionOrder e o próximo lançamento
 * de "saldo do turno anterior" como o saldo real contado pela equipe. */
export async function getConsumoComparativo(empresaIds: string[], date: Date): Promise<ConsumoComparativoRow[]> {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const dayAfterEnd = new Date(dayEnd);
  dayAfterEnd.setDate(dayAfterEnd.getDate() + 1);

  const orders = await prisma.productionOrder.findMany({
    where: { empresaId: { in: empresaIds }, date: { gte: dayStart, lt: dayEnd }, productionItem: { ingredientId: { not: null } } },
    select: {
      productionItemId: true,
      necessidadePrevista: true,
      quantidadeProduzida: true,
      productionItem: { select: { name: true, unidade: true } },
    },
  });

  const rows: ConsumoComparativoRow[] = [];
  for (const order of orders) {
    const [ultimoMovimentoAntes, saldoAnteriorInformado] = await Promise.all([
      prisma.productionStockMovement.findFirst({
        where: { productionItemId: order.productionItemId, createdAt: { lt: dayStart } },
        orderBy: { createdAt: "desc" },
        select: { saldoApos: true },
      }),
      prisma.productionStockMovement.findFirst({
        where: { productionItemId: order.productionItemId, type: "SALDO_ANTERIOR", createdAt: { gte: dayEnd, lt: dayAfterEnd } },
        select: { saldoApos: true },
      }),
    ]);

    const estoqueInicial = ultimoMovimentoAntes?.saldoApos ?? 0;
    const produzido = order.quantidadeProduzida ?? 0;
    const disponivel = estoqueInicial + produzido;
    const saldoEsperado = disponivel - order.necessidadePrevista;
    const saldoReal = saldoAnteriorInformado?.saldoApos ?? null;

    rows.push({
      productionItemId: order.productionItemId,
      name: order.productionItem.name,
      unidade: order.productionItem.unidade,
      estoqueInicial,
      produzido,
      disponivel,
      consumoTeorico: order.necessidadePrevista,
      saldoEsperado,
      saldoReal,
      diferenca: saldoReal !== null ? saldoReal - saldoEsperado : null,
    });
  }

  return rows;
}
