import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { EquipamentoDetailClient } from "./equipamento-detail-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";

export default async function EquipamentoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "manutencao", "canView"))) {
    redirect("/portal/inicio");
  }

  const { id } = await params;
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const [equipamento, teamMembers, prestadores, preventivas] = await Promise.all([
    prisma.equipamento.findFirst({
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
    }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.prestador.findMany({ where: { active: true }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    prisma.manutencaoPreventiva.findMany({
      where: { equipamentoId: id, active: true },
      orderBy: { createdAt: "desc" },
      include: { responsavel: { select: { id: true, name: true } }, prestador: { select: { id: true, nome: true } } },
    }),
  ]);
  if (!equipamento) notFound();

  const custoAcumulado = await prisma.manutencaoRegistro.aggregate({
    where: { equipamentoId: id },
    _sum: { valorTotal: true },
  });

  const headersList = await headers();
  const host = headersList.get("host");
  const protocol = host?.startsWith("localhost") ? "http" : "https";
  const equipamentoUrl = `${protocol}://${host}/portal/manutencao/equipamentos/${id}`;
  const qrCodeDataUrl = await QRCode.toDataURL(equipamentoUrl, { width: 240, margin: 1 });

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

  const serializedPreventivas = preventivas.map((p) => ({
    ...p,
    dataInicio: p.dataInicio.toISOString(),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));

  return (
    <PageContainer title="Manutenção" subtitle="Ficha do equipamento" backHref="/portal/manutencao/equipamentos" backLabel="Equipamentos">
      <EquipamentoDetailClient
        equipamento={serialized as never}
        teamMembers={teamMembers}
        prestadores={prestadores}
        preventivas={serializedPreventivas as never}
        qrCodeDataUrl={qrCodeDataUrl}
      />
    </PageContainer>
  );
}
