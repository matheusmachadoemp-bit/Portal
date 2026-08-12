import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { CrmTabs } from "../crm-tabs";
import { CampanhasClient } from "./campanhas-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function CampanhasPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const campanhas = await prisma.campaign.findMany({
    where: { empresaId: { in: empresaIds } },
    orderBy: { createdAt: "desc" },
    include: { empresa: { select: { name: true, color: true } }, _count: { select: { recipients: true } } },
  });

  const rows = campanhas.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    channel: c.channel,
    offerType: c.offerType,
    audienceType: c.audienceType,
    recipientCount: c._count.recipients,
    lojaNome: c.empresa.name,
    lojaColor: c.empresa.color,
    scheduledAt: c.scheduledAt ? c.scheduledAt.toISOString() : null,
    sentAt: c.sentAt ? c.sentAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  }));

  return (
    <PageContainer title="CRM" subtitle="Campanhas">
      <div className="space-y-6">
        <CrmTabs />
        <CampanhasClient rows={rows} canCreate={ctx?.mode === "single"} />
      </div>
    </PageContainer>
  );
}
