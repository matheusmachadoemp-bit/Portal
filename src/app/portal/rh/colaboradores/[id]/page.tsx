import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { EmployeeProfileClient } from "./employee-profile-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { notFound } from "next/navigation";

export default async function EmployeeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

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
        canCreate={ctx?.mode === "single"}
      />
    </PageContainer>
  );
}
