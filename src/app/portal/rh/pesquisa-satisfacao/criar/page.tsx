import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { GOAL_CATEGORIES, GOAL_CATEGORY_LABEL } from "@/lib/goals";
import { CriarPesquisaClient } from "./criar-client";

const DETAIL_INCLUDE = {
  publico: true,
  perguntas: {
    where: { ativo: true },
    include: { opcoes: { orderBy: { ordem: "asc" as const } } },
    orderBy: { ordem: "asc" as const },
  },
};

export default async function CriarPesquisaPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const [empresas, employeeCounts, survey] = await Promise.all([
    prisma.empresa.findMany({ where: { id: { in: empresaIds }, active: true }, select: { id: true, name: true } }),
    prisma.employee.groupBy({
      by: ["empresaId", "setor"],
      where: { empresaId: { in: empresaIds }, status: "ATIVO" },
      _count: { _all: true },
    }),
    id
      ? prisma.satisfactionSurvey.findFirst({ where: { id, publico: { some: { empresaId: { in: empresaIds } } } }, include: DETAIL_INCLUDE })
      : null,
  ]);

  const counts = employeeCounts.map((c) => ({ empresaId: c.empresaId, setorLabel: c.setor, count: c._count._all }));
  const setores = GOAL_CATEGORIES.filter((c) => c !== "ADMINISTRATIVO").map((c) => ({ key: c, label: GOAL_CATEGORY_LABEL[c] }));

  const serializedSurvey = survey
    ? {
        ...survey,
        startDate: survey.startDate.toISOString(),
        endDate: survey.endDate.toISOString(),
      }
    : null;

  return (
    <PageContainer
      title={survey ? "Editar pesquisa" : "Criar pesquisa"}
      subtitle="Configure o público, as perguntas e o período de resposta."
      backHref="/portal/rh/pesquisa-satisfacao"
      backLabel="Voltar para Pesquisa de Satisfação"
    >
      <CriarPesquisaClient empresas={empresas} employeeCounts={counts} setores={setores} initialSurvey={serializedSurvey} />
    </PageContainer>
  );
}
