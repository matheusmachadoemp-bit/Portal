import { PageContainer } from "@/components/page-container";
import { CrmTabs } from "../crm-tabs";
import { FunilClient } from "./funil-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { loadClientesCompletos } from "@/lib/crm-data";
import { computeClienteMetrics, computeFunil } from "@/lib/crm";

export default async function FunilPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const clientes = await loadClientesCompletos(empresaIds);
  const metrics = computeClienteMetrics(clientes);
  const funil = computeFunil(metrics);

  return (
    <PageContainer title="CRM" subtitle="Funil de Clientes">
      <div className="space-y-6">
        <CrmTabs />
        <FunilClient funil={funil} />
      </div>
    </PageContainer>
  );
}
