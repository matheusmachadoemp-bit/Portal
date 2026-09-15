import { redirect } from "next/navigation";
import { PageContainer } from "@/components/page-container";
import { PartnersClient } from "./partners-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { findPartnersWithTotals } from "@/lib/marketing-partners";
import { resolveRollingPeriod } from "@/lib/periods";

export default async function ParceriasPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "marketing", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  // Carga inicial já filtrada pelo período default do filtro de página
  // ("mes-atual"), pra bater com o que o cliente mostra assim que abre a
  // tela — mesmo padrão de src/app/portal/marketing/redes-sociais/page.tsx.
  const partners = await findPartnersWithTotals(empresaIds, resolveRollingPeriod("mes-atual"));

  const serialized = partners.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() }));

  return (
    <PageContainer title="Marketing" subtitle="Parcerias — ranking de influencers por retorno">
      <PartnersClient initialPartners={serialized} canCreate={ctx?.mode === "single"} />
    </PageContainer>
  );
}
