import { notFound, redirect } from "next/navigation";
import { PageContainer } from "@/components/page-container";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { getCampanhaResultados } from "@/lib/crm-data";
import { CampanhaDetailClient } from "./campanha-detail-client";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";

export default async function CampanhaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "crm", "canView"))) {
    redirect("/portal/inicio");
  }

  const { id } = await params;
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const data = await getCampanhaResultados(id, empresaIds);
  if (!data) notFound();

  return (
    <PageContainer title="CRM" subtitle={data.campanha.name} backHref="/portal/crm/campanhas" backLabel="Voltar para Campanhas">
      <CampanhaDetailClient campanha={data.campanha} resultados={data.resultados} />
    </PageContainer>
  );
}
