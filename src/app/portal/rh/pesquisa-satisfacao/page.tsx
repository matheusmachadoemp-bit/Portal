import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { computeENPS } from "@/lib/satisfaction";
import { PesquisaSatisfacaoClient } from "./pesquisa-satisfacao-client";

const CAN_CREATE_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE"];

// Checagem de cargo (MANAGER_ROLES) pra VISUALIZAR a pesquisa — mesmo padrão de cargo já usado nas
// rotas de API irmãs de RH (desde o commit f109b8e), diferente de CAN_CREATE_ROLES acima (que só
// controla quem pode CRIAR uma pesquisa nova e já excluía Supervisor de propósito). Sem esta
// checagem, qualquer COLABORADOR com o Perfil de Permissão padrão "Funcionário" (rh:canView=true
// de fábrica) conseguia ver as pesquisas de satisfação e o eNPS geral direto nesta página Server
// Component (BUG-004).
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export default async function PesquisaSatisfacaoPage() {
  const [session, ctx] = await Promise.all([auth(), getActiveEmpresaContext()]);
  if (!session?.user || !MANAGER_ROLES.includes(session.user.role)) {
    redirect("/portal/inicio");
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canView"))) {
    redirect("/portal/inicio");
  }
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const [surveys, empresas, notasEnps] = await Promise.all([
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
    prisma.satisfactionAnswer.findMany({
      where: {
        question: { tipo: "ENPS" },
        valorNumero: { not: null },
        response: { empresaId: { in: empresaIds } },
      },
      select: { valorNumero: true },
    }),
  ]);
  const enpsGeral = computeENPS(notasEnps.map((n) => n.valorNumero!));

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
        enpsGeral={notasEnps.length > 0 ? enpsGeral.enps : null}
      />
    </PageContainer>
  );
}
