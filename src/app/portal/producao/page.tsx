import { redirect } from "next/navigation";
import { PageContainer } from "@/components/page-container";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { getProducaoDashboardData } from "@/lib/producao-server";
import { DashboardClient } from "./dashboard-client";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";

export default async function ProducaoPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "producao", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const data = await getProducaoDashboardData(empresaIds, new Date());

  return (
    <PageContainer title="Produção" subtitle="Planejamento inteligente para um serviço ainda melhor.">
      <DashboardClient data={data} />
    </PageContainer>
  );
}
