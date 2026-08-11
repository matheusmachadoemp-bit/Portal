import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { FeriasClient } from "./ferias-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function FeriasPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const [vacations, employees] = await Promise.all([
    prisma.vacation.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { periodoAquisitivoInicio: "desc" },
      include: { employee: { select: { name: true, setor: true } } },
    }),
    prisma.employee.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, setor: true },
    }),
  ]);

  const serialized = vacations.map((v) => ({
    ...v,
    periodoAquisitivoInicio: v.periodoAquisitivoInicio.toISOString(),
    periodoAquisitivoFim: v.periodoAquisitivoFim.toISOString(),
    dataInicio: v.dataInicio ? v.dataInicio.toISOString() : null,
    dataFim: v.dataFim ? v.dataFim.toISOString() : null,
  }));

  return (
    <PageContainer title="RH" subtitle="Férias">
      <FeriasClient initialVacations={serialized} employees={employees} canCreate={ctx?.mode === "single"} />
    </PageContainer>
  );
}
