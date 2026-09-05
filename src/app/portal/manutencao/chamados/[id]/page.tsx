import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { ChamadoDetailClient } from "./chamado-detail-client";
import { auth } from "@/auth";
import { notFound } from "next/navigation";

const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export default async function ChamadoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) notFound();

  const [chamado, teamMembers] = await Promise.all([
    prisma.chamado.findUnique({
      where: { id },
      include: {
        empresa: { select: { id: true, name: true, color: true } },
        equipamento: true,
        solicitante: { select: { id: true, name: true } },
        responsavel: { select: { id: true, name: true } },
        comentarios: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true } } } },
        anexos: { orderBy: { createdAt: "desc" }, include: { uploadedBy: { select: { id: true, name: true } } } },
        historico: { orderBy: { createdAt: "asc" }, include: { user: { select: { id: true, name: true } } } },
        registros: { orderBy: { data: "desc" }, include: { responsavel: { select: { id: true, name: true } }, anexos: true } },
      },
    }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!chamado) notFound();
  if (chamado.status === "RASCUNHO" && chamado.solicitanteId !== session.user.id && !MANAGER_ROLES.includes(session.user.role)) {
    notFound();
  }

  const serialized = {
    ...chamado,
    prazo: chamado.prazo ? chamado.prazo.toISOString() : null,
    resolvidoEm: chamado.resolvidoEm ? chamado.resolvidoEm.toISOString() : null,
    createdAt: chamado.createdAt.toISOString(),
    updatedAt: chamado.updatedAt.toISOString(),
    equipamento: chamado.equipamento
      ? {
          ...chamado.equipamento,
          dataCompra: chamado.equipamento.dataCompra ? chamado.equipamento.dataCompra.toISOString() : null,
          garantiaAte: chamado.equipamento.garantiaAte ? chamado.equipamento.garantiaAte.toISOString() : null,
          ultimaManutencaoEm: chamado.equipamento.ultimaManutencaoEm ? chamado.equipamento.ultimaManutencaoEm.toISOString() : null,
          proximaManutencaoEm: chamado.equipamento.proximaManutencaoEm ? chamado.equipamento.proximaManutencaoEm.toISOString() : null,
          createdAt: chamado.equipamento.createdAt.toISOString(),
          updatedAt: chamado.equipamento.updatedAt.toISOString(),
        }
      : null,
    comentarios: chamado.comentarios.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
    anexos: chamado.anexos.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    historico: chamado.historico.map((h) => ({ ...h, createdAt: h.createdAt.toISOString() })),
    registros: chamado.registros.map((r) => ({ ...r, data: r.data.toISOString(), createdAt: r.createdAt.toISOString() })),
  };

  return (
    <PageContainer title="Manutenção" subtitle={`Chamado ${chamado.protocolo}`} backHref="/portal/manutencao/chamados" backLabel="Chamados">
      <ChamadoDetailClient chamado={serialized as never} teamMembers={teamMembers} currentUserId={session.user.id} currentUserRole={session.user.role} />
    </PageContainer>
  );
}
