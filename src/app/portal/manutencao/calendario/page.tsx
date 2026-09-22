import { redirect } from "next/navigation";
import { addDays, subDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { CalendarioClient } from "./calendario-client";
import { empresaIdsForContext, getActiveEmpresaContext, getSelectableTeamMembers } from "@/lib/empresa";
import { generateDuePreventivaOcorrencias, PREVENTIVA_HORIZONTE_DIAS } from "@/lib/manutencao-server";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";

// Janela padrão de carga do calendário: ±90 dias a partir de hoje. Cobre o horizonte de geração
// de ocorrências futuras (PREVENTIVA_HORIZONTE_DIAS, ver generateDuePreventivaOcorrencias — nunca
// existe ocorrência programada além disso) e um período simétrico para trás, suficiente pra
// pendências atrasadas recentes e para navegar alguns meses no calendário sem precisar buscar mais
// nada. Sem essa janela a query trazia TODAS as ocorrências já geradas desde sempre (inclusive
// concluídas/canceladas há anos), crescendo pra sempre a cada ocorrência recorrente — ver #295.
const JANELA_PASSADO_DIAS = 90;

export default async function CalendarioPreventivoPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "manutencao", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  await generateDuePreventivaOcorrencias(empresaIds);

  const now = new Date();
  // +1 dia de folga sobre o horizonte de geração, só pra absorver a pequena diferença de instante
  // entre o `now` usado ali dentro (generateDuePreventivaOcorrencias) e este aqui.
  const janelaFrom = subDays(now, JANELA_PASSADO_DIAS);
  const janelaTo = addDays(now, PREVENTIVA_HORIZONTE_DIAS + 1);

  const [ocorrencias, equipamentos, teamMembers, prestadores] = await Promise.all([
    prisma.manutencaoPreventivaOcorrencia.findMany({
      where: {
        preventiva: { equipamento: { empresaId: { in: empresaIds } } },
        dataProgramada: { gte: janelaFrom, lte: janelaTo },
      },
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
    getSelectableTeamMembers(empresaIds),
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
      <CalendarioClient
        initialOcorrencias={serialized as never}
        initialRange={{ from: janelaFrom.toISOString(), to: janelaTo.toISOString() }}
        equipamentos={equipamentos}
        teamMembers={teamMembers}
        prestadores={prestadores}
      />
    </PageContainer>
  );
}
