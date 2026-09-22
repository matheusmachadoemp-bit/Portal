import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { GOAL_CATEGORIES, GOAL_CATEGORY_LABEL } from "@/lib/goals";
import { CriarPesquisaClient } from "./criar-client";

// Checagem de cargo (MANAGER_ROLES) pra VISUALIZAR o formulário de criar/editar — mesmo padrão já
// aplicado à página-lista (`../page.tsx`, BUG-004) e à página de resultados (`../[id]/resultados/
// page.tsx`). Sem esta checagem, qualquer COLABORADOR com o Perfil de Permissão padrão
// "Funcionário" (rh:canView=true de fábrica) conseguia abrir esta página e, sabendo/adivinhando o
// ID de uma pesquisa (`?id=...`), ver o formulário pré-preenchido com as perguntas e o público
// daquela pesquisa direto nesta página Server Component (achado de auditoria de segurança, Alto —
// a submissão em si já estava protegida: POST usa CAN_CREATE_ROLES, PATCH usa CAN_MANAGE_ROLES,
// só a leitura/visualização do formulário ficava aberta). Este mesmo componente serve tanto pra
// CRIAR (sem `?id`) quanto pra EDITAR (com `?id`) — um único gate cobre os dois casos.
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

const DETAIL_INCLUDE = {
  publico: true,
  perguntas: {
    where: { ativo: true },
    include: { opcoes: { orderBy: { ordem: "asc" as const } } },
    orderBy: { ordem: "asc" as const },
  },
};

export default async function CriarPesquisaPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const session = await auth();
  if (!session?.user || !MANAGER_ROLES.includes(session.user.role)) {
    redirect("/portal/inicio");
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canView"))) {
    redirect("/portal/inicio");
  }

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
