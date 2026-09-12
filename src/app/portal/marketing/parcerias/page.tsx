import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { PartnersClient } from "./partners-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";

export default async function ParceriasPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "marketing", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const partners = await prisma.marketingPartner.findMany({
    where: { empresaId: { in: empresaIds } },
    orderBy: { vendas: "desc" },
    include: { createdBy: { select: { name: true } }, empresa: { select: { name: true, color: true } } },
  });

  const serialized = partners.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() }));

  return (
    <PageContainer title="Marketing" subtitle="Parcerias — ranking de influencers por retorno">
      <PartnersClient initialPartners={serialized} canCreate={ctx?.mode === "single"} />
    </PageContainer>
  );
}
