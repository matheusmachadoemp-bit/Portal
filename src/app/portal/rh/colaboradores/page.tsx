import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { ColaboradoresClient } from "./colaboradores-client";
import { startOfMonth } from "date-fns";

export default async function ColaboradoresPage() {
  const now = new Date();
  const monthStart = startOfMonth(now);

  const [employees, occurrencesThisMonth] = await Promise.all([
    prisma.employee.findMany({ orderBy: { name: "asc" } }),
    prisma.occurrence.findMany({ where: { date: { gte: monthStart } } }),
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
  }));

  return (
    <PageContainer title="RH" subtitle="Colaboradores">
      <ColaboradoresClient
        initialEmployees={serialized}
        turnover={turnover}
        desligamentos={desligamentos}
        quadroMedio={quadroMedio}
        totalOcorrencias={occurrencesThisMonth.length}
      />
    </PageContainer>
  );
}
