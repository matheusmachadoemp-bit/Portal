import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { AccessDenied } from "@/components/ui/access-denied";
import { EmployeeProfileClient } from "./employee-profile-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { notFound, redirect } from "next/navigation";

// Mesma checagem de cargo (MANAGER_ROLES) já usada pela página-lista irmã (`../page.tsx`, BUG-004)
// e por todas as demais páginas do módulo RH — sem ela, qualquer COLABORADOR com o Perfil de
// Permissão padrão "Funcionário" (rh:canView=true de fábrica) conseguia abrir a ficha de QUALQUER
// colega sabendo o `id` (a query abaixo só filtra por empresaId, nunca por cargo) e ver CPF, chave
// PIX, salário fixo e nota da última avaliação de desempenho, além de ter acesso às abas de
// Financeiro, Ponto Eletrônico, Ocorrências, Férias, Uniformes e Documentos (RG/contrato, via URL
// pública do Vercel Blob) daquele colega — achado CRÍTICO de auditoria (Jonas). Fica restrito a
// Administrador/Gestor/Gerente/Supervisor por cargo, igual ao resto do RH.
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export default async function EmployeeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/portal/inicio");
  }
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return (
      <PageContainer title="RH" subtitle="Ficha do colaborador" backHref="/portal/rh/colaboradores" backLabel="Colaboradores">
        <AccessDenied message="Esta página reúne dados sensíveis do colaborador (CPF, chave PIX, salário, avaliações de desempenho) e por isso é restrita a Administrador, Gestor, Gerente ou Supervisor. Se você precisa desse acesso, fale com seu gestor." />
      </PageContainer>
    );
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canView"))) {
    redirect("/portal/inicio");
  }

  const { id } = await params;
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canManageRh = await hasModulePermission(session.user.id, "rh", "canCreate");
  const canCreate = ctx?.mode === "single" && canManageRh;

  const employee = await prisma.employee.findFirst({
    where: { id, empresaId: { in: empresaIds } },
    include: { empresa: { select: { name: true } } },
  });
  if (!employee) notFound();

  const employeeRef = { select: { id: true, name: true, setor: true } } as const;

  const [financeEntries, timeEntries, occurrences, vacations, uniformDeliveries, documents] = await Promise.all([
    prisma.employeeFinanceEntry.findMany({ where: { employeeId: id }, orderBy: { date: "desc" }, include: { employee: employeeRef } }),
    prisma.timeEntry.findMany({ where: { employeeId: id }, orderBy: { date: "desc" }, include: { employee: employeeRef } }),
    prisma.occurrence.findMany({
      where: { employeeId: id },
      orderBy: { date: "desc" },
      include: { createdBy: { select: { name: true } }, employee: employeeRef },
    }),
    prisma.vacation.findMany({ where: { employeeId: id }, orderBy: { periodoAquisitivoInicio: "desc" }, include: { employee: employeeRef } }),
    prisma.uniformDelivery.findMany({ where: { employeeId: id }, orderBy: { dataEntrega: "desc" }, include: { employee: employeeRef } }),
    prisma.employeeDocument.findMany({ where: { employeeId: id }, orderBy: { createdAt: "desc" }, include: { employee: employeeRef } }),
  ]);

  const employeeDTO = {
    ...employee,
    admissionDate: employee.admissionDate.toISOString(),
    terminationDate: employee.terminationDate ? employee.terminationDate.toISOString() : null,
    birthDate: employee.birthDate ? employee.birthDate.toISOString() : null,
    lastEvaluationDate: employee.lastEvaluationDate ? employee.lastEvaluationDate.toISOString() : null,
    lastTrainingDate: employee.lastTrainingDate ? employee.lastTrainingDate.toISOString() : null,
  };

  return (
    <PageContainer title="RH" subtitle="Ficha do colaborador" backHref="/portal/rh/colaboradores" backLabel="Colaboradores">
      <EmployeeProfileClient
        employee={employeeDTO}
        financeEntries={financeEntries.map((f) => ({ ...f, date: f.date.toISOString() }))}
        timeEntries={timeEntries.map((t) => ({ ...t, date: t.date.toISOString() }))}
        occurrences={occurrences.map((o) => ({
          ...o,
          date: o.date.toISOString(),
          prazo: o.prazo ? o.prazo.toISOString() : null,
        }))}
        vacations={vacations.map((v) => ({
          ...v,
          periodoAquisitivoInicio: v.periodoAquisitivoInicio.toISOString(),
          periodoAquisitivoFim: v.periodoAquisitivoFim.toISOString(),
          dataInicio: v.dataInicio ? v.dataInicio.toISOString() : null,
          dataFim: v.dataFim ? v.dataFim.toISOString() : null,
        }))}
        uniformDeliveries={uniformDeliveries.map((u) => ({ ...u, dataEntrega: u.dataEntrega.toISOString() }))}
        documents={documents.map((d) => ({ ...d, validade: d.validade ? d.validade.toISOString() : null }))}
        canCreate={canCreate}
        isGrupoNordMode={ctx?.mode !== "single"}
      />
    </PageContainer>
  );
}
