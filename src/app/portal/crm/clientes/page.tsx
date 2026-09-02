import { PageContainer } from "@/components/page-container";
import { ClientesClient } from "./clientes-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { loadClientesCompletos } from "@/lib/crm-data";
import { computeClienteMetrics } from "@/lib/crm";

export default async function ClientesPage() {
  // TEMPORARY: try/catch de diagnóstico para revelar o erro real por trás
  // da tela genérica "This page couldn't load" (o Next apaga a mensagem de
  // erro de verdade nas telas error.tsx em produção, só mantém o digest).
  // Remover assim que a causa for encontrada.
  try {
    const ctx = await getActiveEmpresaContext();
    const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
    const isGrupo = ctx?.mode === "grupo";

    const clientes = await loadClientesCompletos(empresaIds);
    const metrics = computeClienteMetrics(clientes);
    const metricsById = new Map(metrics.map((m) => [m.id, m]));

    const rows = clientes.map((c) => {
      const m = metricsById.get(c.id)!;
      const produtos = Array.from(new Set(c.vendas.flatMap((v) => v.items.map((i) => i.nome))));
      return {
        id: c.id,
        nome: c.nome,
        telefone: c.telefone,
        whatsapp: c.whatsapp,
        email: c.email,
        lojaId: c.empresa.id,
        lojaNome: c.empresa.name,
        lojaColor: c.empresa.color,
        bairro: c.bairro,
        cidade: c.cidade,
        canalPreferido: c.canalPreferido,
        createdAt: c.createdAt.toISOString(),
        ehNovo: m.ehNovo,
        pedidos: m.pedidos,
        totalGasto: m.totalGasto,
        ticketMedio: m.ticketMedio,
        ultimaCompra: m.ultimaCompra ? m.ultimaCompra.toISOString() : null,
        diasDesdeUltimaCompra: m.diasDesdeUltimaCompra,
        frequenciaMediaDias: m.frequenciaMediaDias,
        status: m.status,
        produtos,
      };
    });

    const lojas = isGrupo
      ? Array.from(new Map(clientes.map((c) => [c.empresa.id, c.empresa])).values())
      : [];

    return (
      <PageContainer title="CRM" subtitle="Clientes">
        <div className="space-y-6">
          <ClientesClient rows={rows} lojas={lojas} isGrupo={isGrupo} canCreate={ctx?.mode === "single"} />
        </div>
      </PageContainer>
    );
  } catch (err) {
    const e = err as Error;
    return (
      <div style={{ padding: 24, fontFamily: "monospace", color: "#f87171", whiteSpace: "pre-wrap" }}>
        <h1 style={{ color: "white", marginBottom: 12 }}>Erro real (diagnóstico temporário)</h1>
        <p>name: {e?.name}</p>
        <p>message: {e?.message}</p>
        <p>stack:</p>
        <pre>{e?.stack}</pre>
      </div>
    );
  }
}
