import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { DocumentosClient } from "./documentos-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function DocumentosPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const [documents, employees] = await Promise.all([
    prisma.employeeDocument.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { createdAt: "desc" },
      include: { employee: { select: { name: true, setor: true } } },
    }),
    prisma.employee.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, setor: true },
    }),
  ]);

  const serialized = documents.map((d) => ({
    ...d,
    validade: d.validade ? d.validade.toISOString() : null,
    createdAt: d.createdAt.toISOString(),
  }));

  return (
    <PageContainer title="RH" subtitle="Documentos">
      <DocumentosClient initialDocuments={serialized} employees={employees} canCreate={ctx?.mode === "single"} />
    </PageContainer>
  );
}
