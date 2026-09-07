import { PageContainer } from "@/components/page-container";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { getProducaoDashboardData } from "@/lib/producao-server";
import { DashboardClient } from "./dashboard-client";

export default async function ProducaoPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const data = await getProducaoDashboardData(empresaIds, new Date());

  return (
    <PageContainer title="Produção" subtitle="Planejamento inteligente para um serviço ainda melhor.">
      <DashboardClient data={data} />
    </PageContainer>
  );
}
