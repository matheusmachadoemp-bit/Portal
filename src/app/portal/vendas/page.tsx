import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { VendasClient } from "./vendas-client";
import { VendasTabs } from "./vendas-tabs";
import { subDays } from "date-fns";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function VendasPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const entries = await prisma.salesEntry.findMany({
    where: { empresaId: { in: empresaIds }, date: { gte: subDays(new Date(), 90) } },
    orderBy: { date: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  const serialized = entries.map((e) => ({
    ...e,
    date: e.date.toISOString(),
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  }));

  return (
    <PageContainer title="Vendas" subtitle="Faturamento, pedidos, ticket médio e taxa de serviço">
      <div className="space-y-6">
        <VendasTabs />
        <VendasClient initialEntries={serialized} canCreate={ctx?.mode === "single"} />
      </div>
    </PageContainer>
  );
}
