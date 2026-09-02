import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { TrafegoPagoClient } from "./trafego-pago-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function TrafegoPagoPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const entries = await prisma.marketingEntry.findMany({
    where: { empresaId: { in: empresaIds } },
    orderBy: { date: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  const serialized = entries.map((e) => ({ ...e, date: e.date.toISOString() }));

  return (
    <PageContainer title="Marketing" subtitle="Tráfego pago — investimento, ROAS e conversões">
      <TrafegoPagoClient initialEntries={serialized} canCreate={ctx?.mode === "single"} />
    </PageContainer>
  );
}
