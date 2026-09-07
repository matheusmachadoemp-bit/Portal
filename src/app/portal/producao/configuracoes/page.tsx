import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { ConfiguracoesClient } from "./configuracoes-client";

export default async function ProducaoConfiguracoesPage() {
  const empresa = await requireActiveSingleEmpresa();

  const categorias = await prisma.productionCategory.findMany({ orderBy: { order: "asc" } });

  let settings = null;
  let weights: { id: string; weekday: number; percent: number }[] = [];
  if (empresa) {
    [settings, weights] = await Promise.all([
      prisma.productionSettings.upsert({ where: { empresaId: empresa.id }, update: {}, create: { empresaId: empresa.id } }),
      prisma.productionWeekdayWeight.findMany({ where: { empresaId: empresa.id }, orderBy: { weekday: "asc" } }),
    ]);
  }

  return (
    <PageContainer title="Produção" subtitle="Configurações" backHref="/portal/producao" backLabel="Produção">
      <ConfiguracoesClient categorias={categorias} settings={settings} weights={weights} canManage={!!empresa} />
    </PageContainer>
  );
}
