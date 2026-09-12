import { PageContainer } from "@/components/page-container";
import { FunilClient } from "./funil-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { loadClientesCompletos } from "@/lib/crm-data";
import { computeClienteMetrics, computeFunil } from "@/lib/crm";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { redirect } from "next/navigation";

export default async function FunilPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "crm", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const clientes = await loadClientesCompletos(empresaIds);
  const metrics = computeClienteMetrics(clientes);
  const funil = computeFunil(metrics);

  return (
    <PageContainer title="CRM" subtitle="Funil de Clientes">
      <div className="space-y-6">
        <FunilClient funil={funil} />
      </div>
    </PageContainer>
  );
}
