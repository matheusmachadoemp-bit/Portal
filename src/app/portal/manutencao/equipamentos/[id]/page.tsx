import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { EquipamentoDetailClient } from "./equipamento-detail-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { notFound } from "next/navigation";

export default async function EquipamentoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const equipamento = await prisma.equipamento.findFirst({
    where: { id, empresaId: { in: empresaIds } },
    include: {
      empresa: { select: { id: true, name: true, color: true } },
      anexos: { orderBy: { createdAt: "desc" }, include: { uploadedBy: { select: { id: true, name: true } } } },
      chamados: {
        orderBy: { createdAt: "desc" },
        include: { solicitante: { select: { id: true, name: true } }, responsavel: { select: { id: true, name: true } } },
      },
      registros: {
        orderBy: { data: "desc" },
        include: { responsavel: { select: { id: true, name: true } }, anexos: true },
      },
    },
  });
  if (!equipamento) notFound();

  const custoAcumulado = await prisma.manutencaoRegistro.aggregate({
    where: { equipamentoId: id },
    _sum: { valorTotal: true },
  });

  const serialized = {
    ...equipamento,
    dataCompra: equipamento.dataCompra ? equipamento.dataCompra.toISOString() : null,
    garantiaAte: equipamento.garantiaAte ? equipamento.garantiaAte.toISOString() : null,
    ultimaManutencaoEm: equipamento.ultimaManutencaoEm ? equipamento.ultimaManutencaoEm.toISOString() : null,
    proximaManutencaoEm: equipamento.proximaManutencaoEm ? equipamento.proximaManutencaoEm.toISOString() : null,
    createdAt: equipamento.createdAt.toISOString(),
    updatedAt: equipamento.updatedAt.toISOString(),
    chamados: equipamento.chamados.map((c) => ({ ...c, createdAt: c.createdAt.toISOString(), prazo: c.prazo ? c.prazo.toISOString() : null })),
    registros: equipamento.registros.map((r) => ({ ...r, data: r.data.toISOString(), createdAt: r.createdAt.toISOString() })),
    custoAcumulado: custoAcumulado._sum.valorTotal ?? 0,
  };

  return (
    <PageContainer title="Manutenção" subtitle="Ficha do equipamento" backHref="/portal/manutencao/equipamentos" backLabel="Equipamentos">
      <EquipamentoDetailClient equipamento={serialized as never} />
    </PageContainer>
  );
}
