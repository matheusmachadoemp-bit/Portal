import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { InteligenciaClient } from "./inteligencia-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { loadClientesResumo } from "@/lib/crm-data";
import { computeClienteMetricsFromResumo } from "@/lib/crm";
import { computeRfv, RFV_SEGMENT_TONE } from "@/lib/rfv";
import { SALE_CHANNEL_LABEL } from "@/lib/vendas-analytics";
import { subDays } from "date-fns";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { redirect } from "next/navigation";

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// Achado de performance #294: esta é a única das 8 telas que consome
// `loadClientesCompletos`/`loadClientesResumo` que genuinamente precisa de
// dado linha a linha (produto x cliente, canal x cliente, dia/hora de cada
// venda) — é uma análise cruzada da base inteira, não um resumo por cliente.
// Por isso ela NÃO usa mais o resumo compartilhado das outras 7 telas: em vez
// de continuar puxando a árvore aninhada Cliente -> vendas -> itens (que
// tornava as OUTRAS telas mais lentas sem motivo, já que todas compartilhavam
// o mesmo blob cacheado), ela agora faz suas próprias consultas, direto em
// Sale/SaleItem, só com os campos que usa (sem telefone/e-mail/endereço do
// cliente, sem categoria do item, sem duplicar vendas dentro de cada
// cliente). Rankings por período usam `sale.groupBy` (soma/contagem e
// ordenação já no Postgres); dia da semana/hora do dia continuam calculados
// em JS a partir de `dateTime` (não movido para `EXTRACT` em SQL de
// propósito — o resultado tem que bater com `Date.prototype.getDay/getHours`
// de antes, e essa equivalência depende do fuso do processo; ver aviso sobre
// fuso em `resolveCrmPeriod`, em crm.ts).
export default async function InteligenciaPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "crm", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const clientes = await loadClientesResumo(empresaIds);
  const metrics = computeClienteMetricsFromResumo(clientes);
  const now = new Date();
  const clienteIds = clientes.map((c) => c.id);
  const nomeById = new Map(clientes.map((c) => [c.id, c.nome]));
  const ultimaCompraById = new Map(clientes.map((c) => [c.id, c.ultimaCompra]));

  // Vendas (sem itens) da base inteira — só os 4 campos usados por
  // canal/dia/hora. Nenhuma linha de SaleItem nem de Cliente é lida aqui.
  const vendas =
    clienteIds.length === 0
      ? []
      : await prisma.sale.findMany({
          where: { clienteId: { in: clienteIds } },
          select: { clienteId: true, dateTime: true, channel: true, valorTotal: true },
        });

  // Produtos: quantas linhas de SaleItem e soma de quantidade cada par
  // (produto, cliente) tem — equivalente ao loop aninhado de antes
  // (cliente -> venda -> item, incrementando por LINHA de item, não por
  // venda), só que agregado no Postgres. `linhas >= 2` = "recomprador" desse
  // produto, igual ao `comprasPorProduto.set(...) >= 2` de antes.
  const produtoClienteRows =
    clienteIds.length === 0
      ? []
      : await prisma.$queryRaw<{ nome: string; clienteId: string; linhas: number; quantidade: number }[]>`
          SELECT si.nome AS nome, s."clienteId" AS "clienteId", COUNT(*)::int AS linhas, SUM(si.quantidade) AS quantidade
          FROM "SaleItem" si
          JOIN "Sale" s ON s.id = si."saleId"
          WHERE s."clienteId" = ANY(${clienteIds}::text[])
          GROUP BY si.nome, s."clienteId"
        `;

  const produtoStats = new Map<string, { quantidade: number; compradores: Set<string>; recompradores: Set<string> }>();
  for (const row of produtoClienteRows) {
    const st = produtoStats.get(row.nome) ?? { quantidade: 0, compradores: new Set<string>(), recompradores: new Set<string>() };
    st.quantidade += Number(row.quantidade);
    st.compradores.add(row.clienteId);
    if (row.linhas >= 2) st.recompradores.add(row.clienteId);
    produtoStats.set(row.nome, st);
  }

  const canalStats = new Map<string, { clientes: Set<string>; receita: number }>();
  const diaStats = new Map<string, number>();
  const horaStats = new Map<string, number>();
  for (const v of vendas) {
    if (v.channel) {
      const st = canalStats.get(v.channel) ?? { clientes: new Set<string>(), receita: 0 };
      if (v.clienteId) st.clientes.add(v.clienteId);
      st.receita += v.valorTotal;
      canalStats.set(v.channel, st);
    }
    diaStats.set(DIAS_SEMANA[v.dateTime.getDay()], (diaStats.get(DIAS_SEMANA[v.dateTime.getDay()]) ?? 0) + 1);
    const hour = v.dateTime.getHours();
    const bucket = hour < 11 ? "Manhã" : hour < 15 ? "Almoço" : hour < 18 ? "Tarde" : hour < 22 ? "Jantar" : "Madrugada";
    horaStats.set(bucket, (horaStats.get(bucket) ?? 0) + 1);
  }

  const topProdutos = Array.from(produtoStats.entries())
    .map(([nome, s]) => ({ nome, quantidade: s.quantidade, compradores: s.compradores.size }))
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 10);

  const produtosRecompra = Array.from(produtoStats.entries())
    .filter(([, s]) => s.compradores.size >= 3)
    .map(([nome, s]) => ({ nome, taxaRecompra: (s.recompradores.size / s.compradores.size) * 100, compradores: s.compradores.size }))
    .sort((a, b) => b.taxaRecompra - a.taxaRecompra)
    .slice(0, 10);

  const metricsById = new Map(metrics.map((m) => [m.id, m]));
  const produtosRecorrencia = Array.from(produtoStats.entries())
    .filter(([, s]) => s.compradores.size >= 3)
    .map(([nome, s]) => {
      const pedidosMedios =
        Array.from(s.compradores).reduce((sum, id) => sum + (metricsById.get(id)?.pedidos ?? 0), 0) / s.compradores.size;
      return { nome, pedidosMedios, compradores: s.compradores.size };
    })
    .sort((a, b) => b.pedidosMedios - a.pedidosMedios)
    .slice(0, 10);

  const canalDist = Array.from(canalStats.entries()).map(([canal, s]) => ({
    canal: SALE_CHANNEL_LABEL[canal] ?? canal,
    clientes: s.clientes.size,
    receita: s.receita,
  }));

  const diaDist = DIAS_SEMANA.map((d) => ({ label: d, count: diaStats.get(d) ?? 0 }));
  const horaDist = ["Manhã", "Almoço", "Tarde", "Jantar", "Madrugada"].map((h) => ({ label: h, count: horaStats.get(h) ?? 0 }));

  // RFM
  const comHistorico = metrics.filter((m) => m.pedidos > 0);
  const rfvInputs = comHistorico.map((m) => ({
    clienteId: m.id,
    diasDesdeUltimaCompra: m.diasDesdeUltimaCompra ?? 999,
    frequencia: m.pedidos,
    valor: m.totalGasto,
  }));
  const rfv = computeRfv(rfvInputs);
  const rfvById = new Map(rfv.map((r) => [r.clienteId, r]));

  const grupoStats = new Map<string, { count: number; receita: number; frequencias: number[] }>();
  for (const m of comHistorico) {
    const r = rfvById.get(m.id);
    if (!r) continue;
    const st = grupoStats.get(r.segmento) ?? { count: 0, receita: 0, frequencias: [] };
    st.count++;
    st.receita += m.totalGasto;
    if (m.frequenciaMediaDias !== null) st.frequencias.push(m.frequenciaMediaDias);
    grupoStats.set(r.segmento, st);
  }
  const porSegmento = Array.from(grupoStats.entries()).map(([segmento, s]) => ({
    segmento,
    tone: RFV_SEGMENT_TONE[segmento as keyof typeof RFV_SEGMENT_TONE] ?? "default",
    count: s.count,
    ticketMedio: s.count ? s.receita / s.count : 0,
    ltv: s.count ? s.receita / s.count : 0,
    frequenciaMedia: s.frequencias.length ? s.frequencias.reduce((sum, v) => sum + v, 0) / s.frequencias.length : null,
  }));

  const matriz = comHistorico
    .map((m) => {
      const r = rfvById.get(m.id);
      if (!r) return null;
      return { id: m.id, nome: m.nome, scoreR: r.scoreR, scoreF: r.scoreF, valor: m.totalGasto, segmento: r.segmento };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  // Índice de ordem por nome — mesma fonte/ordem (`clientes`, que já vem com
  // `orderBy: { nome: "asc" }` de `loadClientesResumo`) usada pelo ranking
  // "histórico" abaixo. Usado só como critério de desempate, não pra exibir.
  const ordemNome = new Map(clientes.map((c, idx) => [c.id, idx]));

  // Ranking por período — soma/contagem já agregada no Postgres
  // (`sale.groupBy`) em vez de filtrar a lista completa de vendas de cada
  // cliente 4 vezes em JS (achado de performance #294): isso já reduz o
  // resultado a 1 linha por cliente (no máximo `clienteIds.length` linhas),
  // então ordenar/cortar as top 100 em JS depois (em vez de no Postgres)
  // continua barato. IMPORTANTE:
  // `ultimaCompra` no ranking é sempre a última compra da VIDA TODA do
  // cliente (igual ao comportamento de antes — o código original também
  // calculava a partir de `c.vendas` inteiro, não da lista já filtrada pelo
  // período), não a última compra dentro da janela do período — por isso
  // vem do resumo (`ultimaCompraById`), igual pros 4 períodos.
  //
  // Desempate (achado do Teulis, revisão de #294/#297): clientes com
  // `totalGasto` igual no período precisam desempatar do MESMO jeito nas 4
  // abas (30 dias/90 dias/ano/histórico). "Histórico" (`rankingHistorico`
  // abaixo) desempata por nome incidentalmente, porque reordena de forma
  // estável um array que já vem ordenado por nome. Aqui replicamos o mesmo
  // critério explicitamente via `ordemNome`, em vez de deixar o Postgres
  // desempatar por `clienteId` (cuid, ordem arbitrária e diferente da de
  // "histórico") — isso já mudou uma posição de empate real (53↔54) no
  // dataset de teste, e o corte pro `take: 100` precisa ser decidido só
  // DEPOIS do desempate certo (daí o `take: 100` ter saído da query do
  // Postgres e virado `.slice(0, 100)` abaixo, depois do sort completo) —
  // do contrário, um empate bem na posição 100 poderia incluir/excluir um
  // cliente diferente do que "histórico" incluiria.
  async function rankingPorPeriodo(desde: Date | null) {
    if (clienteIds.length === 0) return [];
    const rows = await prisma.sale.groupBy({
      by: ["clienteId"],
      where: { clienteId: { in: clienteIds }, ...(desde ? { dateTime: { gte: desde } } : {}) },
      _sum: { valorTotal: true },
      _count: { _all: true },
    });
    return rows
      .filter((r) => r.clienteId)
      .map((r) => {
        const clienteId = r.clienteId as string;
        const totalGasto = r._sum.valorTotal ?? 0;
        const pedidos = r._count._all;
        const ultimaCompra = ultimaCompraById.get(clienteId) ?? null;
        return {
          id: clienteId,
          nome: nomeById.get(clienteId) ?? "",
          totalGasto,
          pedidos,
          ticketMedio: pedidos ? totalGasto / pedidos : 0,
          ultimaCompra: ultimaCompra ? ultimaCompra.toISOString() : null,
        };
      })
      .sort((a, b) => b.totalGasto - a.totalGasto || (ordemNome.get(a.id) ?? 0) - (ordemNome.get(b.id) ?? 0))
      .slice(0, 100);
  }

  // "Histórico" (sem corte de data) é exatamente o resumo por cliente que já
  // temos em memória (mesmos números de `loadClientesResumo`) — não precisa
  // de outra consulta.
  const rankingHistorico = metrics
    .filter((m) => m.pedidos > 0)
    .map((m) => ({
      id: m.id,
      nome: m.nome,
      totalGasto: m.totalGasto,
      pedidos: m.pedidos,
      ticketMedio: m.ticketMedio,
      ultimaCompra: m.ultimaCompra ? m.ultimaCompra.toISOString() : null,
    }))
    .sort((a, b) => b.totalGasto - a.totalGasto)
    .slice(0, 100);

  const [ranking30, ranking90, rankingAno] = await Promise.all([
    rankingPorPeriodo(subDays(now, 30)),
    rankingPorPeriodo(subDays(now, 90)),
    rankingPorPeriodo(subDays(now, 365)),
  ]);

  const rankings = {
    "30dias": ranking30,
    "90dias": ranking90,
    ano: rankingAno,
    historico: rankingHistorico,
  };

  return (
    <PageContainer title="CRM" subtitle="Inteligência de Cliente">
      <div className="space-y-6">
        <InteligenciaClient
          topProdutos={topProdutos}
          produtosRecompra={produtosRecompra}
          produtosRecorrencia={produtosRecorrencia}
          canalDist={canalDist}
          diaDist={diaDist}
          horaDist={horaDist}
          porSegmento={porSegmento}
          matriz={matriz}
          rankings={rankings}
        />
      </div>
    </PageContainer>
  );
}
