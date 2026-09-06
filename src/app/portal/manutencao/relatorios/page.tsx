import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { RelatoriosClient } from "./relatorios-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { getManutencaoRelatorioData } from "@/lib/manutencao-server";

export default async function RelatoriosManutencaoPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const [data, equipamentos, prestadores] = await Promise.all([
    getManutencaoRelatorioData(empresaIds),
    prisma.equipamento.findMany({ where: { empresaId: { in: empresaIds } }, select: { id: true, nome: true, codigo: true }, orderBy: { nome: "asc" } }),
    prisma.prestador.findMany({ where: { active: true }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
  ]);

  return (
    <PageContainer title="Manutenção" subtitle="Relatórios" backHref="/portal/manutencao" backLabel="Manutenção">
      <RelatoriosClient initialData={data} equipamentos={equipamentos} prestadores={prestadores} />
    </PageContainer>
  );
}
