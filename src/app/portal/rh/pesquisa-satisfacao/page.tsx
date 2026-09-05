import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { PesquisaSatisfacaoClient } from "./pesquisa-satisfacao-client";

const CAN_CREATE_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE"];

export default async function PesquisaSatisfacaoPage() {
  const [session, ctx] = await Promise.all([auth(), getActiveEmpresaContext()]);
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const [surveys, empresas] = await Promise.all([
    prisma.satisfactionSurvey.findMany({
      where: { publico: { some: { empresaId: { in: empresaIds } } } },
      include: {
        publico: { include: { empresa: { select: { id: true, name: true } } } },
        perguntas: { select: { id: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.empresa.findMany({ where: { id: { in: empresaIds }, active: true }, select: { id: true, name: true } }),
  ]);

  const serialized = surveys.map((s) => ({
    ...s,
    startDate: s.startDate.toISOString(),
    endDate: s.endDate.toISOString(),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }));

  return (
    <PageContainer title="Pesquisa de Satisfação" subtitle="Acompanhe o clima, a satisfação e a experiência da equipe.">
      <PesquisaSatisfacaoClient
        initialSurveys={serialized}
        empresas={empresas}
        canCreate={CAN_CREATE_ROLES.includes(session?.user?.role ?? "")}
      />
    </PageContainer>
  );
}
