import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { ChamadosClient } from "./chamados-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { auth } from "@/auth";

const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export default async function ChamadosPage() {
  const session = await auth();
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const canSeeDrafts = session?.user ? MANAGER_ROLES.includes(session.user.role) : false;

  const [chamados, equipamentos, teamMembers] = await Promise.all([
    prisma.chamado.findMany({
      where: {
        empresaId: { in: empresaIds },
        ...(canSeeDrafts ? {} : { OR: [{ status: { not: "RASCUNHO" } }, { solicitanteId: session?.user.id }] }),
      },
      orderBy: { createdAt: "desc" },
      include: {
        empresa: { select: { id: true, name: true, color: true } },
        equipamento: { select: { id: true, nome: true, codigo: true, fotoUrl: true } },
        solicitante: { select: { id: true, name: true } },
        responsavel: { select: { id: true, name: true } },
        anexos: { where: { tipo: "FOTO" }, take: 1, select: { fileUrl: true } },
        _count: { select: { comentarios: true } },
      },
    }),
    prisma.equipamento.findMany({
      where: { empresaId: { in: empresaIds } },
      select: { id: true, nome: true, codigo: true, fotoUrl: true, setor: true },
      orderBy: { nome: "asc" },
    }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const serialized = chamados.map((c) => ({
    ...c,
    prazo: c.prazo ? c.prazo.toISOString() : null,
    resolvidoEm: c.resolvidoEm ? c.resolvidoEm.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));

  return (
    <PageContainer title="Manutenção" subtitle="Chamados" backHref="/portal/manutencao" backLabel="Manutenção">
      <ChamadosClient
        initialChamados={serialized as never}
        equipamentos={equipamentos}
        teamMembers={teamMembers}
        canCreate={ctx?.mode === "single"}
      />
    </PageContainer>
  );
}
