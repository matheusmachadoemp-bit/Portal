import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isReativacao } from "@/lib/crm";

// Consultada em ~8 telas do CRM (clientes, funil, segmentos, aniversariantes,
// inteligência, relatórios, automações, nova campanha). Traz o histórico
// completo de vendas de cada cliente (necessário: VIP, frequência média e
// categoria favorita são métricas de vida inteira do cliente, não podem ser
// cortadas por período). Cacheada por 60s para evitar recalcular a cada troca
// de aba dentro do módulo — não usa tag/invalidação manual porque uma venda
// nova em qualquer lugar do sistema deixaria a lógica de invalidação frágil;
// uma janela curta de staleness é aceitável para essas métricas analíticas.
const loadClientesCompletosCached = unstable_cache(
  async (empresaIds: string[]) =>
    prisma.cliente.findMany({
      where: { empresaId: { in: empresaIds } },
      select: {
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
        vendas: {
          select: {
            id: true,
            dateTime: true,
            valorTotal: true,
            channel: true,
            items: { select: { nome: true, categoria: true, quantidade: true } },
          },
        },
      },
      orderBy: { nome: "asc" },
    }),
  ["crm-clientes-completos"],
  { revalidate: 60 }
);

// unstable_cache serializa o retorno pra JSON: numa leitura que bate no
// cache (em vez de recalcular), Date vira string simples — quem chamar
// .toISOString()/.getTime() num campo de data quebra de forma intermitente
// (funciona quando o cache está frio, quebra quando está quente). Sempre
// reconstrói os campos de data em Date de verdade na saída, cache ou não.
export async function loadClientesCompletos(empresaIds: string[]) {
  const clientes = await loadClientesCompletosCached([...empresaIds].sort());
  return clientes.map((c) => ({
    ...c,
    createdAt: new Date(c.createdAt),
    dataNascimento: c.dataNascimento ? new Date(c.dataNascimento) : null,
    vendas: c.vendas.map((v) => ({ ...v, dateTime: new Date(v.dateTime) })),
  }));
}

export type ClienteCompleto = Awaited<ReturnType<typeof loadClientesCompletos>>[number];

export async function resolveAudience(
  empresaId: string,
  audienceType: "TODOS" | "SEGMENTO" | "CLIENTES",
  opts: { segmentId?: string | null; autoSegmentoKey?: string | null; clienteIds?: string[] }
): Promise<string[]> {
  if (audienceType === "CLIENTES") return opts.clienteIds ?? [];

  const clientes = await loadClientesCompletos([empresaId]);

  if (audienceType === "TODOS") return clientes.map((c) => c.id);

  if (audienceType === "SEGMENTO") {
    const { computeClienteMetrics, computeAutoSegments, matchesCriteria } = await import("@/lib/crm");
    const metrics = computeClienteMetrics(clientes);
    const produtosPorCliente = new Map(clientes.map((c) => [c.id, new Set(c.vendas.flatMap((v) => v.items.map((i) => i.nome)))]));

    if (opts.autoSegmentoKey) {
      const auto = computeAutoSegments(clientes, metrics).find((s) => s.key === opts.autoSegmentoKey);
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
