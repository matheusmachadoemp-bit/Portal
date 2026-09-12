import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { CampanhasClient } from "./campanhas-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { redirect } from "next/navigation";

export default async function CampanhasPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "crm", "canView"))) {
    redirect("/portal/inicio");
  }

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
        <CampanhasClient rows={rows} canCreate={ctx?.mode === "single"} />
      </div>
    </PageContainer>
  );
}
