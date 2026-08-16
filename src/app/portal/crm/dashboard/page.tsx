import { PageContainer } from "@/components/page-container";
import { CrmDashboardClient } from "./dashboard-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { getCrmDashboardData } from "@/lib/crm-dashboard";

export default async function CrmDashboardPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const data = await getCrmDashboardData(empresaIds, "mes");

  return (
    <PageContainer title="CRM" subtitle="Visão Geral">
      <div className="space-y-6">
        <CrmDashboardClient initialKey="mes" initialData={data} />
      </div>
    </PageContainer>
  );
}
