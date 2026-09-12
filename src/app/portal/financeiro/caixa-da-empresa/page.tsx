import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { CaixaClient } from "./caixa-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

export default async function CaixaDaEmpresaPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "financeiro", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];

  const [movements, accounts] = await Promise.all([
    prisma.cashMovement.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { date: "desc" },
      take: 200,
      include: {
        bankAccount: { select: { name: true } },
        destino: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.bankAccount.findMany({ where: { active: true, empresaId: { in: empresaIds } }, orderBy: { name: "asc" } }),
  ]);

  const serialized = movements.map((m) => ({ ...m, date: m.date.toISOString() }));

  return (
    <PageContainer title="Financeiro" subtitle="Caixa da Empresa">
      <div className="space-y-6">
        <CaixaClient initialMovements={serialized} accounts={accounts} canCreate={ctx?.mode === "single"} />
      </div>
    </PageContainer>
  );
}
