import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { EstoqueTabs } from "../estoque-tabs";
import { ContagemMensalClient } from "./contagem-mensal-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { auth } from "@/auth";

export default async function ContagemMensalPage() {
  const ctx = await getActiveEmpresaContext();
  const session = await auth();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canCreate = ctx?.mode === "single";

  const counts = await prisma.stockCount.findMany({
    where: { empresaId: { in: empresaIds }, type: "MENSAL" },
    orderBy: { dataContagem: "desc" },
    take: 24,
    include: { items: true, createdBy: { select: { name: true } } },
  });

  return (
    <PageContainer title="Estoque" subtitle="Contagem Mensal">
      <div className="space-y-6">
        <EstoqueTabs />
        <ContagemMensalClient
          initialCounts={counts.map((c) => ({
            id: c.id,
            mes: c.mes,
            ano: c.ano,
            dataContagem: c.dataContagem.toISOString(),
            responsavel: c.responsavel,
            status: c.status,
            checklistJson: c.checklistJson,
            aprovadoPor: c.aprovadoPor,
            aprovadoEm: c.aprovadoEm ? c.aprovadoEm.toISOString() : null,
            totalItens: c.items.length,
            conferidos: c.items.filter((i) => i.quantidadeContada !== null).length,
            divergencias: c.items.filter((i) => i.status === "DIVERGENCIA").length,
            createdByName: c.createdBy.name,
          }))}
          canCreate={canCreate}
          userRole={session?.user?.role ?? ""}
        />
      </div>
    </PageContainer>
  );
}
