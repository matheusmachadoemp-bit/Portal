import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { SATISFACTION_STATUS_LABEL } from "@/lib/satisfaction";
import { ResultadosClient } from "./resultados-client";

export default async function ResultadosPesquisaPage({ params }: { params: Promise<{ id: string }> }) {
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
        <p className="text-nord-gray text-xs">{survey.publico.map((p) => p.empresa.name).join(", ")}</p>
        <p className="text-nord-gray text-xs">Status: {SATISFACTION_STATUS_LABEL[survey.status]}</p>
        <p className="text-nord-gray text-xs">{survey.perguntas.length} pergunta(s) configurada(s)</p>
      </div>
      <ResultadosClient surveyId={survey.id} surveyTitle={survey.title} />
    </PageContainer>
  );
}
