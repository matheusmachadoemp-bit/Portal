import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { getConsumoComparativo, getIndicadoresData } from "@/lib/producao-indicadores-server";
import { resolveRollingPeriod } from "@/lib/periods";
import { IndicadoresClient } from "./indicadores-client";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";

export default async function ProducaoIndicadoresPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "producao", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const empresa = await requireActiveSingleEmpresa();

  const range = resolveRollingPeriod("mes-atual");

  const settings = empresa ? await prisma.productionSettings.findUnique({ where: { empresaId: empresa.id } }) : null;
  const [data, consumoHoje] = await Promise.all([
    getIndicadoresData(empresaIds, range.from, range.to, settings?.toleranciaAlertaPct ?? 10),
    getConsumoComparativo(empresaIds, new Date()),
  ]);

  return (
    <PageContainer title="Produção" subtitle="Indicadores" backHref="/portal/producao" backLabel="Produção">
      <IndicadoresClient initialData={data} consumoHoje={consumoHoje} />
    </PageContainer>
  );
}
