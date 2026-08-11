import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { VendaAcumuladaClient } from "./venda-acumulada-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function VendaAcumuladaPage() {
  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const [entries, employees] = await Promise.all([
    prisma.waiterSaleEntry.findMany({
      where: { empresaId: { in: empresaIds } },
      include: { employee: { select: { id: true, name: true, cargo: true, photoUrl: true } } },
      orderBy: { date: "desc" },
    }),
    prisma.employee.findMany({
      where: { empresaId: { in: empresaIds }, status: "ATIVO" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, cargo: true, photoUrl: true },
    }),
  ]);

  const serializedEntries = entries.map((e) => ({
    id: e.id,
    employeeId: e.employeeId,
    employeeName: e.employee.name,
    employeePhoto: e.employee.photoUrl,
    amount: e.amount,
    date: e.date.toISOString(),
    note: e.note,
  }));

  return (
    <PageContainer title="Metas" subtitle="Venda Acumulada" backHref="/portal/metas" backLabel="Visão geral de metas">
      <VendaAcumuladaClient initialEntries={serializedEntries} employees={employees} canCreate={ctx?.mode === "single"} />
    </PageContainer>
  );
}
