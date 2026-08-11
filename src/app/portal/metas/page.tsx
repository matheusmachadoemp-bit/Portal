import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { MetasOverviewClient } from "./metas-overview-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function MetasOverviewPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const goals = await prisma.goal.findMany({
    where: { empresaId: { in: empresaIds } },
    orderBy: { endDate: "asc" },
    include: { empresa: { select: { name: true } } },
  });

  const serialized = goals.map((g) => ({
    id: g.id,
    name: g.name,
    category: g.category,
    responsavel: g.responsavel,
    valorMeta: g.valorMeta,
    valorRealizado: g.valorRealizado,
    unidade: g.unidade,
    startDate: g.startDate.toISOString(),
    endDate: g.endDate.toISOString(),
    bonificacao: g.bonificacao,
    status: g.status,
    empresaNome: g.empresa.name,
  }));

  return (
    <PageContainer title="Metas" subtitle="Visão geral">
      <MetasOverviewClient goals={serialized} />
    </PageContainer>
  );
}
