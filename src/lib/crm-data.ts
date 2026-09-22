import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isReativacao, inicioUltimos60Dias, type VendaResumo } from "@/lib/crm";

const CLIENTE_BASE_SELECT = {
  id: true,
  empresaId: true,
  nome: true,
  telefone: true,
  whatsapp: true,
  email: true,
  dataNascimento: true,
  endereco: true,
  bairro: true,
  cidade: true,
  canalPreferido: true,
  createdAt: true,
  empresa: { select: { id: true, name: true, color: true } },
} as const;

// Consultada em ~8 telas do CRM (clientes, funil, segmentos, aniversariantes,
// inteligência, relatórios, automações, nova campanha). Antes (achado de
// performance #294) trazia o histórico COMPLETO de vendas + itens de cada
// cliente só para somar/contar/min/max em JS (pedidos, total gasto, primeira
// e última compra — os 4 números de que VIP/frequência/status realmente
// precisam, ver `computeMetricsCore` em crm.ts). Isso fazia as 8 telas
// desserializarem um blob com toda linha de Sale/SaleItem de toda a base
// mesmo quando só liam o resumo agregado. Agora esses 4 números são
// calculados no próprio Postgres (`sale.groupBy`) — nenhuma linha de Sale ou
// SaleItem chega ao Node. Telas que precisam de granularidade linha a linha
// (produtos comprados, histórico de reativação, cross-tab de Inteligência)
// usam consultas específicas e mais enxutas (`loadProdutosPorCliente`,
// `loadVendasResumoPorCliente`, ou a query direta da própria página de
// Inteligência) em vez deste resumo. Cacheada por 60s pelo mesmo motivo de
// antes: evitar recalcular a cada troca de aba dentro do módulo, sem
// tag/invalidação ativa (uma venda nova em qualquer lugar do sistema deixaria
// a lógica de invalidação frágil; uma janela curta de staleness é aceitável
// para métricas analíticas).
const loadClientesResumoCached = unstable_cache(
  async (empresaIds: string[]) => {
    const clientes = await prisma.cliente.findMany({
      where: { empresaId: { in: empresaIds } },
      select: CLIENTE_BASE_SELECT,
      orderBy: { nome: "asc" },
    });
    const clienteIds = clientes.map((c) => c.id);
    // Sem `where.clienteId` aqui não teríamos como agrupar por cliente — mas
    // de propósito NÃO filtra por `Sale.empresaId` (só por `clienteId`, igual
    // a consulta antiga acessava `vendas` só através da relação do cliente,
    // sem filtro extra de empresa na venda em si).
    const agregados =
      clienteIds.length === 0
        ? []
        : await prisma.sale.groupBy({
            by: ["clienteId"],
            where: { clienteId: { in: clienteIds } },
            _count: { _all: true },
            _sum: { valorTotal: true },
            _min: { dateTime: true },
            _max: { dateTime: true },
          });
    const agregadoPorCliente = new Map(agregados.map((a) => [a.clienteId as string, a]));

    return clientes.map((c) => {
      const a = agregadoPorCliente.get(c.id);
      return {
        ...c,
        pedidos: a?._count._all ?? 0,
        totalGasto: a?._sum.valorTotal ?? 0,
        primeiraCompra: a?._min.dateTime ?? null,
        ultimaCompra: a?._max.dateTime ?? null,
      };
    });
  },
  ["crm-clientes-resumo"],
  { revalidate: 60 }
);

// unstable_cache serializa o retorno pra JSON: numa leitura que bate no
// cache (em vez de recalcular), Date vira string simples — quem chamar
// .toISOString()/.getTime() num campo de data quebra de forma intermitente
// (funciona quando o cache está frio, quebra quando está quente). Sempre
// reconstrói os campos de data em Date de verdade na saída, cache ou não.
export async function loadClientesResumo(empresaIds: string[]) {
  const clientes = await loadClientesResumoCached([...empresaIds].sort());
  return clientes.map((c) => ({
    ...c,
    createdAt: new Date(c.createdAt),
    dataNascimento: c.dataNascimento ? new Date(c.dataNascimento) : null,
    primeiraCompra: c.primeiraCompra ? new Date(c.primeiraCompra) : null,
    ultimaCompra: c.ultimaCompra ? new Date(c.ultimaCompra) : null,
  }));
}

export type ClienteResumo = Awaited<ReturnType<typeof loadClientesResumo>>[number];

// Nomes distintos de produtos comprados por cliente (usado pelo filtro de
// "produto" em CRM > Clientes e CRM > Segmentos, e pelo critério `produtos`
// de segmento em `matchesCriteria`). Traz só `nome` + o `clienteId` da venda
// (via relação, já que SaleItem não guarda clienteId direto) — nada de
// categoria/quantidade/preço/data, que essas telas não usam. Ainda é uma
// leitura de toda linha de SaleItem da base (não dá pra agrupar por cliente
// no Prisma sem SQL bruto, já que `clienteId` não é campo do próprio
// SaleItem), mas um blob de 2 campos por linha é bem mais leve que o cliente
// completo com vendas+itens aninhados de antes. Cacheada pelo mesmo motivo
// e TTL de `loadClientesResumo`.
const loadProdutosPorClienteCached = unstable_cache(
  async (empresaIds: string[]) => {
    const clientes = await prisma.cliente.findMany({
      where: { empresaId: { in: empresaIds } },
      select: { id: true },
    });
    const clienteIds = clientes.map((c) => c.id);
    if (clienteIds.length === 0) return [];
    const itens = await prisma.saleItem.findMany({
      where: { sale: { clienteId: { in: clienteIds } } },
      select: { nome: true, sale: { select: { clienteId: true } } },
    });
    const porCliente = new Map<string, string[]>();
    for (const item of itens) {
      const clienteId = item.sale.clienteId;
      if (!clienteId) continue;
      const atual = porCliente.get(clienteId);
      if (atual) {
        if (!atual.includes(item.nome)) atual.push(item.nome);
      } else {
        porCliente.set(clienteId, [item.nome]);
      }
    }
    return Array.from(porCliente.entries());
  },
  ["crm-produtos-por-cliente"],
  { revalidate: 60 }
);

export async function loadProdutosPorCliente(empresaIds: string[]): Promise<Map<string, Set<string>>> {
  const entries = await loadProdutosPorClienteCached([...empresaIds].sort());
  return new Map(entries.map(([clienteId, nomes]) => [clienteId, new Set(nomes)]));
}

/**
 * Quantidade de vendas dos últimos 60 dias por cliente — usado só pelo
 * critério "Recorrentes" de `computeAutoSegments` (ver `inicioUltimos60Dias`
 * em crm.ts para a equivalência com o cálculo em JS de antes). Consulta
 * pequena e não cacheada (o corte de 60 dias já limita o tamanho do
 * resultado, e cachear por `now` sem normalizar a chave faria cache miss
 * sempre); os outros usos de `loadClientesResumo`/`loadProdutosPorCliente`
 * continuam cacheados por 60s normalmente.
 */
export async function countComprasRecentesPorCliente(clienteIds: string[], now: Date = new Date()): Promise<Map<string, number>> {
  if (clienteIds.length === 0) return new Map();
  const rows = await prisma.sale.groupBy({
    by: ["clienteId"],
    where: { clienteId: { in: clienteIds }, dateTime: { gte: inicioUltimos60Dias(now) } },
    _count: { _all: true },
  });
  return new Map(rows.filter((r) => r.clienteId).map((r) => [r.clienteId as string, r._count._all]));
}

// Histórico de vendas (id/data/valor — sem itens) por cliente, ordenado por
// data. Usado só pelo relatório "Receita recuperada" de CRM > Relatórios
// (isReativacao precisa comparar cada venda com a anterior do mesmo
// cliente, então precisa da sequência completa, não só do resumo agregado)
// — nenhuma outra tela usa. Ainda lê todas as vendas da base (não dá pra
// resumir "reativação" com groupBy simples, já que depende do par
// venda-anterior de cada venda), mas sem SaleItem nenhum, o que já corta a
// maior parte do peso de antes (SaleItem costuma ter ~4x mais linhas que
// Sale). Cacheada pelo mesmo motivo/TTL das demais.
const loadVendasResumoPorClienteCached = unstable_cache(
  async (empresaIds: string[]) => {
    const clientes = await prisma.cliente.findMany({
      where: { empresaId: { in: empresaIds } },
      select: { id: true },
    });
    const clienteIds = clientes.map((c) => c.id);
    if (clienteIds.length === 0) return [];
    const vendas = await prisma.sale.findMany({
      where: { clienteId: { in: clienteIds } },
      select: { id: true, clienteId: true, dateTime: true, valorTotal: true },
      // `id` como desempate: com só `dateTime`, vendas do mesmo cliente com
      // o mesmo horário exato ficam em ordem arbitrária, e `isReativacao`
      // (crm.ts) compara cada venda com a IMEDIATAMENTE ANTERIOR nessa
      // sequência — sem desempate determinístico, "Receita recuperada" (CRM
      // > Relatórios) pode variar entre execuções/consultas diferentes.
      orderBy: [{ dateTime: "asc" }, { id: "asc" }],
    });
    const porCliente = new Map<string, { id: string; dateTime: Date; valorTotal: number }[]>();
    for (const v of vendas) {
      if (!v.clienteId) continue;
      const atual = porCliente.get(v.clienteId);
      const linha = { id: v.id, dateTime: v.dateTime, valorTotal: v.valorTotal };
      if (atual) atual.push(linha);
      else porCliente.set(v.clienteId, [linha]);
    }
    return Array.from(porCliente.entries());
  },
  ["crm-vendas-resumo-por-cliente"],
  { revalidate: 60 }
);

export async function loadVendasResumoPorCliente(empresaIds: string[]): Promise<Map<string, VendaResumo[]>> {
  const entries = await loadVendasResumoPorClienteCached([...empresaIds].sort());
  return new Map(
    entries.map(([clienteId, vendas]) => [clienteId, vendas.map((v) => ({ ...v, dateTime: new Date(v.dateTime) }))])
  );
}

export async function resolveAudience(
  empresaId: string,
  audienceType: "TODOS" | "SEGMENTO" | "CLIENTES",
  opts: { segmentId?: string | null; autoSegmentoKey?: string | null; clienteIds?: string[] }
): Promise<string[]> {
  if (audienceType === "CLIENTES") {
    const clienteIds = opts.clienteIds ?? [];
    if (clienteIds.length === 0) return [];
    const validos = await prisma.cliente.findMany({
      where: { id: { in: clienteIds }, empresaId },
      select: { id: true },
    });
    return validos.map((c) => c.id);
  }

  const clientes = await loadClientesResumo([empresaId]);

  if (audienceType === "TODOS") return clientes.map((c) => c.id);

  if (audienceType === "SEGMENTO") {
    const { computeClienteMetricsFromResumo, computeAutoSegments, matchesCriteria } = await import("@/lib/crm");
    const metrics = computeClienteMetricsFromResumo(clientes);
    const produtosPorCliente = await loadProdutosPorCliente([empresaId]);

    if (opts.autoSegmentoKey) {
      const compras60dById = await countComprasRecentesPorCliente(clientes.map((c) => c.id));
      const auto = computeAutoSegments(metrics, compras60dById).find((s) => s.key === opts.autoSegmentoKey);
      if (!auto) return [];
      return metrics.filter((m) => matchesCriteria(m, auto.criteria, produtosPorCliente.get(m.id))).map((m) => m.id);
    }

    if (opts.segmentId) {
      const segmento = await prisma.crmSegment.findFirst({ where: { id: opts.segmentId, empresaId } });
      if (!segmento) return [];
      return metrics
        .filter((m) => matchesCriteria(m, segmento.criteria as never, produtosPorCliente.get(m.id)))
        .map((m) => m.id);
    }
  }

  return [];
}

export async function getCampanhaResultados(id: string, empresaIds: string[]) {
  const campanha = await prisma.campaign.findFirst({
    where: { id, empresaId: { in: empresaIds } },
    include: {
      empresa: { select: { name: true, color: true } },
      createdBy: { select: { name: true } },
      segment: { select: { name: true } },
      recipients: {
        include: {
          cliente: {
            select: { id: true, nome: true, vendas: { select: { id: true, dateTime: true, valorTotal: true } } },
          },
        },
      },
    },
  });
  if (!campanha) return null;

  const enviados = campanha.recipients.length;
  let pedidos = 0;
  let receita = 0;
  let reativados = 0;
  const compradores = new Set<string>();

  const referencia = campanha.sentAt ?? campanha.createdAt;
  for (const r of campanha.recipients) {
    const vendasOrdenadas = [...r.cliente.vendas].sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
    const vendasPosCampanha = vendasOrdenadas.filter((v) => v.dateTime >= referencia);
    if (vendasPosCampanha.length === 0) continue;

    compradores.add(r.cliente.id);
    pedidos += vendasPosCampanha.length;
    receita += vendasPosCampanha.reduce((s, v) => s + v.valorTotal, 0);
    if (vendasPosCampanha.some((v) => isReativacao(vendasOrdenadas, v))) reativados++;
  }

  const conversao = enviados ? (compradores.size / enviados) * 100 : 0;
  const ticketMedio = pedidos ? receita / pedidos : 0;
  const descontos =
    campanha.offerType === "DESCONTO_VALOR" || campanha.offerType === "CASHBACK"
      ? (campanha.offerValue ?? 0) * compradores.size
      : campanha.offerType === "DESCONTO_PERCENTUAL"
        ? receita * ((campanha.offerValue ?? 0) / 100)
        : 0;
  const custo = descontos;
  const roi = custo > 0 ? (receita - custo) / custo : null;

  return {
    campanha: {
      id: campanha.id,
      name: campanha.name,
      status: campanha.status,
      audienceType: campanha.audienceType,
      segmentoNome: campanha.segment?.name ?? null,
      channel: campanha.channel,
      offerType: campanha.offerType,
      offerValue: campanha.offerValue,
      offerDescription: campanha.offerDescription,
      message: campanha.message,
      scheduledAt: campanha.scheduledAt ? campanha.scheduledAt.toISOString() : null,
      sentAt: campanha.sentAt ? campanha.sentAt.toISOString() : null,
      createdAt: campanha.createdAt.toISOString(),
      createdBy: campanha.createdBy.name,
      empresaNome: campanha.empresa.name,
      empresaColor: campanha.empresa.color,
    },
    resultados: { enviados, pedidos, compradores: compradores.size, conversao, receita, ticketMedio, descontos, custo, roi, reativados },
  };
}

export type CampanhaResultados = NonNullable<Awaited<ReturnType<typeof getCampanhaResultados>>>;
