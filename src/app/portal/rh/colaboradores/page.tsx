import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { ColaboradoresClient } from "./colaboradores-client";
import { startOfMonth } from "date-fns";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

// Mesma checagem de cargo (MANAGER_ROLES) já usada pelas rotas de API irmãs (`/api/rh/employees`
// etc., desde o commit f109b8e) — sem ela, qualquer COLABORADOR com o Perfil de Permissão padrão
// "Funcionário" (que já vem com rh:canView=true de fábrica) conseguia ver CPF, chave PIX e salário
// fixo de todos os colegas direto nesta página Server Component (BUG-004: a API já bloqueava,
// mas esta página busca via Prisma direto, sem passar pela API). Fica restrito a
// Administrador/Gestor/Gerente/Supervisor por cargo, igual à API — nenhuma das rotas de RH tem
// hoje uma restrição de "Líder só vê o próprio setor" para Colaboradores (isso só existe na Escala
// de Folgas), então Supervisor é tratado como gestor pleno aqui, igual GERENTE/GESTOR/ADMINISTRADOR.
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export default async function ColaboradoresPage() {
  const session = await auth();
  if (!session?.user || !MANAGER_ROLES.includes(session.user.role)) {
    redirect("/portal/inicio");
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canView"))) {
    redirect("/portal/inicio");
  }

  const now = new Date();
  const monthStart = startOfMonth(now);
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canManageRh = await hasModulePermission(session.user.id, "rh", "canCreate");
  const canCreate = ctx?.mode === "single" && canManageRh;

  const [employees, occurrencesThisMonth] = await Promise.all([
    prisma.employee.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { name: "asc" },
      include: { empresa: { select: { name: true } } },
    }),
    prisma.occurrence.findMany({
      where: { date: { gte: monthStart }, employee: { empresaId: { in: empresaIds } } },
    }),
  ]);

  const activeStart = employees.filter(
    (e) => e.admissionDate <= monthStart && (!e.terminationDate || e.terminationDate >= monthStart)
  ).length;
  const activeEnd = employees.filter((e) => e.status !== "DESLIGADO").length;
  const desligamentos = employees.filter(
    (e) => e.status === "DESLIGADO" && e.terminationDate && e.terminationDate >= monthStart
  ).length;
  const quadroMedio = (activeStart + activeEnd) / 2;
  const turnover = quadroMedio > 0 ? (desligamentos / quadroMedio) * 100 : 0;

  const serialized = employees.map((e) => ({
    ...e,
    admissionDate: e.admissionDate.toISOString(),
    terminationDate: e.terminationDate ? e.terminationDate.toISOString() : null,
    birthDate: e.birthDate ? e.birthDate.toISOString() : null,
    lastEvaluationDate: e.lastEvaluationDate ? e.lastEvaluationDate.toISOString() : null,
    lastTrainingDate: e.lastTrainingDate ? e.lastTrainingDate.toISOString() : null,
  }));

  return (
    <PageContainer title="RH" subtitle="Colaboradores">
      <ColaboradoresClient
        initialEmployees={serialized}
        turnover={turnover}
        desligamentos={desligamentos}
        quadroMedio={quadroMedio}
        totalOcorrencias={occurrencesThisMonth.length}
        canCreate={canCreate}
        showLoja={ctx?.mode === "grupo"}
        isGrupoNordMode={ctx?.mode !== "single"}
      />
    </PageContainer>
  );
}
