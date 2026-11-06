import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { getProducaoDashboardData } from "@/lib/producao-server";
import { getConsumoComparativo, getIndicadoresData } from "@/lib/producao-indicadores-server";
import { resolveRollingPeriod } from "@/lib/periods";
import { DashboardClient } from "./dashboard-client";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";

/**
 * "Visão Geral" de Produção — além do resumo do dia (sempre foi aqui), também mostra, abaixo de
 * um divisor "Indicadores de Produção", os gráficos/alertas que antes viviam na subcategoria
 * separada "Indicadores" (`/portal/producao/indicadores`, removida — pedido do usuário: "pegar a
 * categoria Indicadores e jogar pra Visão Geral, unificar as categorias"). Mesmo padrão já usado
 * pela tela "Visão Geral" de Reservas ao incorporar a antiga subcategoria "Relatórios" (ver
 * src/app/portal/reservas/visao-geral/page.tsx). O período inicial da seção de indicadores é
 * sempre "mes-atual" (igual a tela antiga); o usuário pode trocar o período pelo filtro da própria
 * seção, que recarrega só aquele bloco via `GET /api/producao/indicadores`.
 */
export default async function ProducaoPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "producao", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const empresa = await requireActiveSingleEmpresa();

  const indicadoresRange = resolveRollingPeriod("mes-atual");
  const settings = empresa ? await prisma.productionSettings.findUnique({ where: { empresaId: empresa.id } }) : null;

  const [data, indicadoresData, consumoHoje] = await Promise.all([
    getProducaoDashboardData(empresaIds, new Date()),
    getIndicadoresData(empresaIds, indicadoresRange.from, indicadoresRange.to, settings?.toleranciaAlertaPct ?? 10),
    getConsumoComparativo(empresaIds, new Date()),
  ]);

  return (
    <PageContainer title="Produção" subtitle="Planejamento inteligente para um serviço ainda melhor.">
      <DashboardClient data={data} indicadoresData={indicadoresData} consumoHoje={consumoHoje} />
    </PageContainer>
  );
}
