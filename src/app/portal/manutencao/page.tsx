import { PageContainer } from "@/components/page-container";
import { ManutencaoDashboardClient } from "./manutencao-dashboard-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { getManutencaoDashboardData } from "@/lib/manutencao-server";

export default async function ManutencaoDashboardPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const data = await getManutencaoDashboardData(empresaIds);

  const serialized = {
    kpis: data.kpis,
    chamadosRecentes: data.chamadosRecentes.map((c) => ({
      ...c,
      prazo: c.prazo ? c.prazo.toISOString() : null,
      resolvidoEm: c.resolvidoEm ? c.resolvidoEm.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
    proximasManutencoesList: data.proximasManutencoesList.map((e) => ({
      ...e,
      dataCompra: e.dataCompra ? e.dataCompra.toISOString() : null,
      garantiaAte: e.garantiaAte ? e.garantiaAte.toISOString() : null,
      ultimaManutencaoEm: e.ultimaManutencaoEm ? e.ultimaManutencaoEm.toISOString() : null,
      proximaManutencaoEm: e.proximaManutencaoEm ? e.proximaManutencaoEm.toISOString() : null,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    })),
    equipamentosCriticos: data.equipamentosCriticos.map((e) => ({
      ...e,
      dataCompra: e.dataCompra ? e.dataCompra.toISOString() : null,
      garantiaAte: e.garantiaAte ? e.garantiaAte.toISOString() : null,
      ultimaManutencaoEm: e.ultimaManutencaoEm ? e.ultimaManutencaoEm.toISOString() : null,
      proximaManutencaoEm: e.proximaManutencaoEm ? e.proximaManutencaoEm.toISOString() : null,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    })),
  };

  return (
    <PageContainer title="Manutenção" subtitle="Controle de chamados, equipamentos e manutenções preventivas.">
      <ManutencaoDashboardClient data={serialized as never} />
    </PageContainer>
  );
}
