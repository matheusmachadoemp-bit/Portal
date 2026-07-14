import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { MarketingClient } from "./marketing-client";

export default async function MarketingPage() {
  const entries = await prisma.marketingEntry.findMany({
    orderBy: { date: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  const serialized = entries.map((e) => ({ ...e, date: e.date.toISOString() }));

  return (
    <PageContainer title="Marketing" subtitle="Tráfego pago, redes sociais e conversão">
      <MarketingClient initialEntries={serialized} />
    </PageContainer>
  );
}
