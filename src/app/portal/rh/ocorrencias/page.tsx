import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { OcorrenciasClient } from "./ocorrencias-client";

export default async function OcorrenciasPage() {
  const [occurrences, employees] = await Promise.all([
    prisma.occurrence.findMany({
      orderBy: { date: "desc" },
      include: { employee: { select: { id: true, name: true, setor: true } } },
    }),
    prisma.employee.findMany({ orderBy: { name: "asc" } }),
  ]);

  const serialized = occurrences.map((o) => ({ ...o, date: o.date.toISOString() }));

  return (
    <PageContainer title="RH" subtitle="Ocorrências: faltas, atrasos e atestados">
      <OcorrenciasClient
        initialOccurrences={serialized}
        employees={employees.map((e) => ({ id: e.id, name: e.name, setor: e.setor }))}
      />
    </PageContainer>
  );
}
