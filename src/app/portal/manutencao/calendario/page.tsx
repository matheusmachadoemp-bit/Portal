import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { CalendarioClient } from "./calendario-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { generateDuePreventivaOcorrencias } from "@/lib/manutencao-server";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";

export default async function CalendarioPreventivoPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "manutencao", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  await generateDuePreventivaOcorrencias(empresaIds);

  const [ocorrencias, equipamentos, teamMembers, prestadores] = await Promise.all([
    prisma.manutencaoPreventivaOcorrencia.findMany({
      where: { preventiva: { equipamento: { empresaId: { in: empresaIds } } } },
      orderBy: { dataProgramada: "asc" },
      include: {
        preventiva: {
          include: {
            equipamento: { select: { id: true, nome: true, codigo: true, setor: true, fotoUrl: true, empresa: { select: { name: true, color: true } } } },
            responsavel: { select: { id: true, name: true } },
            prestador: { select: { id: true, nome: true } },
          },
        },
      },
    }),
    prisma.equipamento.findMany({ where: { empresaId: { in: empresaIds } }, select: { id: true, nome: true, codigo: true }, orderBy: { nome: "asc" } }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.prestador.findMany({ where: { active: true }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
  ]);

  const serialized = ocorrencias.map((o) => ({
    ...o,
    dataProgramada: o.dataProgramada.toISOString(),
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    preventiva: {
      ...o.preventiva,
      dataInicio: o.preventiva.dataInicio.toISOString(),
      createdAt: o.preventiva.createdAt.toISOString(),
      updatedAt: o.preventiva.updatedAt.toISOString(),
    },
  }));

  return (
    <PageContainer title="Manutenção" subtitle="Calendário preventivo" backHref="/portal/manutencao" backLabel="Manutenção">
      <CalendarioClient initialOcorrencias={serialized as never} equipamentos={equipamentos} teamMembers={teamMembers} prestadores={prestadores} />
    </PageContainer>
  );
}
