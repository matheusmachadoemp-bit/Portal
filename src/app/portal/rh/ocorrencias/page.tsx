import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { OcorrenciasClient } from "./ocorrencias-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function OcorrenciasPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const [occurrences, employees] = await Promise.all([
    prisma.occurrence.findMany({
      where: { employee: { empresaId: { in: empresaIds } } },
      orderBy: { date: "desc" },
      include: { employee: { select: { id: true, name: true, setor: true } } },
    }),
    prisma.employee.findMany({ where: { empresaId: { in: empresaIds } }, orderBy: { name: "asc" } }),
  ]);

  const serialized = occurrences.map((o) => ({ ...o, date: o.date.toISOString() }));

  return (
    <PageContainer title="RH" subtitle="Ocorrências: faltas, atrasos e atestados">
      <OcorrenciasClient
        initialOccurrences={serialized}
        employees={employees.map((e) => ({ id: e.id, name: e.name, setor: e.setor }))}
        canCreate={ctx?.mode === "single"}
      />
    </PageContainer>
  );
}
