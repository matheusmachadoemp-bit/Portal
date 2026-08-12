import { PageContainer } from "@/components/page-container";
import { CrmTabs } from "../crm-tabs";
import { InteligenciaClient } from "./inteligencia-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { loadClientesCompletos } from "@/lib/crm-data";
import { computeClienteMetrics } from "@/lib/crm";
import { computeRfv, RFV_SEGMENT_TONE } from "@/lib/rfv";
import { SALE_CHANNEL_LABEL } from "@/lib/vendas-analytics";
import { subDays } from "date-fns";

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export default async function InteligenciaPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const clientes = await loadClientesCompletos(empresaIds);
  const metrics = computeClienteMetrics(clientes);
  const now = new Date();

  // Produtos
  const produtoStats = new Map<string, { quantidade: number; compradores: Set<string>; recompradores: Set<string> }>();
  const canalStats = new Map<string, { clientes: Set<string>; receita: number }>();
  const diaStats = new Map<string, number>();
  const horaStats = new Map<string, number>();

  for (const c of clientes) {
    const comprasPorProduto = new Map<string, number>();
    for (const v of c.vendas) {
      if (v.channel) {
        const st = canalStats.get(v.channel) ?? { clientes: new Set<string>(), receita: 0 };
        st.clientes.add(c.id);
        st.receita += v.valorTotal;
        canalStats.set(v.channel, st);
      }
      diaStats.set(DIAS_SEMANA[v.dateTime.getDay()], (diaStats.get(DIAS_SEMANA[v.dateTime.getDay()]) ?? 0) + 1);
      const hour = v.dateTime.getHours();
      const bucket = hour < 11 ? "Manhã" : hour < 15 ? "Almoço" : hour < 18 ? "Tarde" : hour < 22 ? "Jantar" : "Madrugada";
      horaStats.set(bucket, (horaStats.get(bucket) ?? 0) + 1);

      for (const item of v.items) {
        comprasPorProduto.set(item.nome, (comprasPorProduto.get(item.nome) ?? 0) + 1);
        const st = produtoStats.get(item.nome) ?? { quantidade: 0, compradores: new Set<string>(), recompradores: new Set<string>() };
        st.quantidade += item.quantidade;
        st.compradores.add(c.id);
        produtoStats.set(item.nome, st);
      }
    }
    for (const [nome, count] of comprasPorProduto) {
      if (count >= 2) produtoStats.get(nome)!.recompradores.add(c.id);
    }
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

  // Ranking
  function ranking(desde: Date | null) {
    return clientes
      .map((c) => {
        const vendasPeriodo = desde ? c.vendas.filter((v) => v.dateTime >= desde) : c.vendas;
        const totalGasto = vendasPeriodo.reduce((s, v) => s + v.valorTotal, 0);
        const ultimaCompra = c.vendas.reduce((max: Date | null, v) => (!max || v.dateTime > max ? v.dateTime : max), null as Date | null);
        return {
          id: c.id,
          nome: c.nome,
          totalGasto,
          pedidos: vendasPeriodo.length,
          ticketMedio: vendasPeriodo.length ? totalGasto / vendasPeriodo.length : 0,
          ultimaCompra: ultimaCompra ? ultimaCompra.toISOString() : null,
        };
      })
      .filter((c) => c.pedidos > 0)
      .sort((a, b) => b.totalGasto - a.totalGasto)
      .slice(0, 100);
  }

  const rankings = {
    "30dias": ranking(subDays(now, 30)),
    "90dias": ranking(subDays(now, 90)),
    ano: ranking(subDays(now, 365)),
    historico: ranking(null),
  };

  return (
    <PageContainer title="CRM" subtitle="Inteligência de Cliente">
      <div className="space-y-6">
        <CrmTabs />
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
