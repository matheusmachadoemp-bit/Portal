import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { PontoEletronicoClient } from "./ponto-eletronico-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function PontoEletronicoPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const [entries, employees] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { date: "desc" },
      include: { employee: { select: { name: true, setor: true } } },
    }),
    prisma.employee.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, setor: true },
    }),
  ]);

  const serialized = entries.map((e) => ({ ...e, date: e.date.toISOString() }));

  return (
    <PageContainer title="RH" subtitle="Ponto Eletrônico">
      <PontoEletronicoClient initialEntries={serialized} employees={employees} canCreate={ctx?.mode === "single"} />
    </PageContainer>
  );
}
