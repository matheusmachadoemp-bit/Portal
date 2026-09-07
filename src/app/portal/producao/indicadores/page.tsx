import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { getConsumoComparativo, getIndicadoresData } from "@/lib/producao-indicadores-server";
import { IndicadoresClient } from "./indicadores-client";

export default async function ProducaoIndicadoresPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const empresa = await requireActiveSingleEmpresa();

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);

  const settings = empresa ? await prisma.productionSettings.findUnique({ where: { empresaId: empresa.id } }) : null;
  const [data, consumoHoje] = await Promise.all([
    getIndicadoresData(empresaIds, from, to, settings?.toleranciaAlertaPct ?? 10),
    getConsumoComparativo(empresaIds, new Date()),
  ]);

  return (
    <PageContainer title="Produção" subtitle="Indicadores" backHref="/portal/producao" backLabel="Produção">
      <IndicadoresClient initialData={data} consumoHoje={consumoHoje} />
    </PageContainer>
  );
}
