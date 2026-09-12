import { PageContainer } from "@/components/page-container";
import { CrmDashboardClient } from "./dashboard/dashboard-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { getCrmDashboardData } from "@/lib/crm-dashboard";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { redirect } from "next/navigation";

export default async function CrmPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "crm", "canView"))) {
    redirect("/portal/inicio");
  }

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
