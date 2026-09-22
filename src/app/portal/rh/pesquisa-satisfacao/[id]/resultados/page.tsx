import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { SATISFACTION_STATUS_LABEL } from "@/lib/satisfaction";
import { ResultadosClient } from "./resultados-client";

// Checagem de cargo (MANAGER_ROLES) pra VISUALIZAR os resultados — mesmo padrão já aplicado à
// página-lista (`../page.tsx`, BUG-004): sem esta checagem, qualquer COLABORADOR com o Perfil de
// Permissão padrão "Funcionário" (rh:canView=true de fábrica) conseguia ver o eNPS geral, o eNPS
// por setor, os alertas de "setor com clima ruim" e os comentários abertos anônimos direto nesta
// página Server Component, mesmo sem cargo de gestor (achado de auditoria de segurança, Alto).
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export default async function ResultadosPesquisaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !MANAGER_ROLES.includes(session.user.role)) {
    redirect("/portal/inicio");
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canView"))) {
    redirect("/portal/inicio");
  }

  const { id } = await params;
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const survey = await prisma.satisfactionSurvey.findFirst({
    where: { id, publico: { some: { empresaId: { in: empresaIds } } } },
    include: {
      publico: { include: { empresa: { select: { id: true, name: true } } } },
      perguntas: { select: { id: true } },
    },
  });
  if (!survey) notFound();

  return (
    <PageContainer
      title="Resultados da pesquisa"
      subtitle={survey.title}
      backHref="/portal/rh/pesquisa-satisfacao"
      backLabel="Voltar para Pesquisa de Satisfação"
    >
      <div className="nord-card p-4 space-y-1 text-sm mb-4">
        <p className="text-white font-medium">{survey.title}</p>
        <p className="text-nord-gray text-xs">{Array.from(new Set(survey.publico.map((p) => p.empresa.name))).join(", ")}</p>
        <p className="text-nord-gray text-xs">Status: {SATISFACTION_STATUS_LABEL[survey.status]}</p>
        <p className="text-nord-gray text-xs">{survey.perguntas.length} pergunta(s) configurada(s)</p>
      </div>
      <ResultadosClient surveyId={survey.id} surveyTitle={survey.title} />
    </PageContainer>
  );
}
