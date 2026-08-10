import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { CampaignsClient } from "./campaigns-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function CampanhasPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const [campaigns, teamMembers] = await Promise.all([
    prisma.marketingCampaign.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { startDate: "desc" },
      include: {
        responsavel: { select: { name: true } },
        empresa: { select: { name: true, color: true } },
        tasks: { select: { id: true, status: true } },
      },
    }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const serialized = campaigns.map((c) => ({
    ...c,
    startDate: c.startDate.toISOString(),
    endDate: c.endDate.toISOString(),
  }));

  return (
    <PageContainer title="Marketing" subtitle="Campanhas">
      <CampaignsClient initialCampaigns={serialized as never} teamMembers={teamMembers} canCreate={ctx?.mode === "single"} />
    </PageContainer>
  );
}
