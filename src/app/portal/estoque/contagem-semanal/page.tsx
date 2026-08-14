import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { EstoqueTabs } from "../estoque-tabs";
import { ContagemSemanalClient } from "./contagem-semanal-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function ContagemSemanalPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canCreate = ctx?.mode === "single";

  const counts = await prisma.stockCount.findMany({
    where: { empresaId: { in: empresaIds }, type: "SEMANAL" },
    orderBy: { dataContagem: "desc" },
    take: 30,
    include: { items: true, createdBy: { select: { name: true } } },
  });

  return (
    <PageContainer title="Estoque" subtitle="Contagem Semanal">
      <div className="space-y-6">
        <EstoqueTabs />
        <ContagemSemanalClient
          initialCounts={counts.map((c) => ({
            id: c.id,
            setor: c.setor,
            semana: c.semana,
            ano: c.ano,
            dataContagem: c.dataContagem.toISOString(),
            responsavel: c.responsavel,
            horaInicio: c.horaInicio,
            horaFim: c.horaFim,
            status: c.status,
            totalItens: c.items.length,
            conferidos: c.items.filter((i) => i.quantidadeContada !== null).length,
            divergencias: c.items.filter((i) => i.status === "DIVERGENCIA").length,
            createdByName: c.createdBy.name,
          }))}
          canCreate={canCreate}
        />
      </div>
    </PageContainer>
  );
}
