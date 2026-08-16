import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { SegmentosClient } from "./segmentos-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { loadClientesCompletos } from "@/lib/crm-data";
import { computeClienteMetrics, computeAutoSegments, matchesCriteria, type SegmentCriteria } from "@/lib/crm";

export default async function SegmentosPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const isGrupo = ctx?.mode === "grupo";

  const [clientes, segmentosSalvos] = await Promise.all([
    loadClientesCompletos(empresaIds),
    prisma.crmSegment.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { name: true } } },
    }),
  ]);

  const metrics = computeClienteMetrics(clientes);
  const autoSegments = computeAutoSegments(clientes, metrics);

  const produtosPorCliente = new Map(
    clientes.map((c) => [c.id, new Set(c.vendas.flatMap((v) => v.items.map((i) => i.nome)))])
  );

  const customSegments = segmentosSalvos.map((s) => {
    const criteria = s.criteria as SegmentCriteria;
    const matched = metrics.filter((m) => matchesCriteria(m, criteria, produtosPorCliente.get(m.id)));
    const receita = matched.reduce((sum, m) => sum + m.totalGasto, 0);
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      criteria,
      createdBy: s.createdBy.name,
      createdAt: s.createdAt.toISOString(),
      count: matched.length,
      receita,
      ticketMedio: matched.length ? receita / matched.length : 0,
    };
  });

  const clienteRows = clientes.map((c) => {
    const m = metrics.find((mm) => mm.id === c.id)!;
    return {
      id: c.id,
      empresaId: c.empresaId,
      totalGasto: m.totalGasto,
      pedidos: m.pedidos,
      diasDesdeUltimaCompra: m.diasDesdeUltimaCompra,
      status: m.status,
      ehNovo: m.ehNovo,
      frequenciaMediaDias: m.frequenciaMediaDias,
      produtos: Array.from(produtosPorCliente.get(c.id) ?? []),
    };
  });

  const lojas = isGrupo ? Array.from(new Map(clientes.map((c) => [c.empresa.id, c.empresa])).values()) : [];

  return (
    <PageContainer title="CRM" subtitle="Segmentos">
      <div className="space-y-6">
        <SegmentosClient
          autoSegments={autoSegments}
          customSegments={customSegments}
          clienteRows={clienteRows}
          lojas={lojas}
          isGrupo={isGrupo}
          canCreate={ctx?.mode === "single"}
        />
      </div>
    </PageContainer>
  );
}
