import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { UniformesClient } from "./uniformes-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function UniformesPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const [deliveries, employees] = await Promise.all([
    prisma.uniformDelivery.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { dataEntrega: "desc" },
      include: { employee: { select: { name: true, setor: true } } },
    }),
    prisma.employee.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, setor: true },
    }),
  ]);

  const serialized = deliveries.map((d) => ({ ...d, dataEntrega: d.dataEntrega.toISOString() }));

  return (
    <PageContainer title="RH" subtitle="Uniformes">
      <UniformesClient initialDeliveries={serialized} employees={employees} canCreate={ctx?.mode === "single"} />
    </PageContainer>
  );
}
