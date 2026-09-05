import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { EquipamentosClient } from "./equipamentos-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function EquipamentosPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const equipamentos = await prisma.equipamento.findMany({
    where: { empresaId: { in: empresaIds } },
    orderBy: { createdAt: "desc" },
    include: {
      empresa: { select: { id: true, name: true, color: true } },
      _count: { select: { chamados: true } },
    },
  });

  const serialized = equipamentos.map((e) => ({
    ...e,
    dataCompra: e.dataCompra ? e.dataCompra.toISOString() : null,
    garantiaAte: e.garantiaAte ? e.garantiaAte.toISOString() : null,
    ultimaManutencaoEm: e.ultimaManutencaoEm ? e.ultimaManutencaoEm.toISOString() : null,
    proximaManutencaoEm: e.proximaManutencaoEm ? e.proximaManutencaoEm.toISOString() : null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  }));

  return (
    <PageContainer title="Manutenção" subtitle="Equipamentos" backHref="/portal/manutencao" backLabel="Manutenção">
      <EquipamentosClient initialEquipamentos={serialized as never} canCreate={ctx?.mode === "single"} />
    </PageContainer>
  );
}
