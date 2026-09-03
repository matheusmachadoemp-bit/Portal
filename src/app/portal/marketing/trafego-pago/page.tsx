import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { TrafegoPagoClient } from "./trafego-pago-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { loadMetaAdsInsightSummary } from "@/lib/meta-ads-insights";

export default async function TrafegoPagoPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const [entries, metaAdsSummary] = await Promise.all([
    prisma.marketingEntry.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { date: "desc" },
      include: { createdBy: { select: { name: true } } },
    }),
    loadMetaAdsInsightSummary(empresaIds),
  ]);

  const serialized = entries.map((e) => ({ ...e, date: e.date.toISOString() }));

  return (
    <PageContainer title="Marketing" subtitle="Tráfego pago — investimento, ROAS e conversões">
      <TrafegoPagoClient initialEntries={serialized} canCreate={ctx?.mode === "single"} metaAdsSummary={metaAdsSummary} />
    </PageContainer>
  );
}
