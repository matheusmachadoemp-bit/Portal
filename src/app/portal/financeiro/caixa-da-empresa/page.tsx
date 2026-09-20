import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { CaixaClient } from "./caixa-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

// Checagem de cargo (MANAGER_ROLES) — mesmo padrão já usado no módulo RH (rotas de API desde o
// commit f109b8e) e replicado aqui: sem ela, qualquer COLABORADOR com o Perfil de Permissão padrão
// "Funcionário" (financeiro:canView=true de fábrica) conseguia ver todas as movimentações de caixa
// da empresa direto nesta página Server Component (BUG-004). Fica restrito a
// Administrador/Gestor/Gerente/Supervisor por cargo.
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export default async function CaixaDaEmpresaPage() {
  const session = await auth();
  if (!session?.user || !MANAGER_ROLES.includes(session.user.role)) {
    redirect("/portal/inicio");
  }
  if (!(await hasModulePermission(session.user.id, "financeiro", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canManageFinanceiro = await hasModulePermission(session.user.id, "financeiro", "canCreate");
  const canCreate = ctx?.mode === "single" && canManageFinanceiro;

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
    // Todas as contas (ativas e inativas) — a seção "Contas Bancárias", agora
    // embutida nesta página, precisa listar/gerenciar as inativas também. Os
    // cards de saldo e o dropdown de "Nova movimentação" filtram só as ativas
    // dentro do client (CaixaClient), igual já faziam antes.
    prisma.bankAccount.findMany({ where: { empresaId: { in: empresaIds } }, orderBy: { name: "asc" } }),
  ]);

  const serializedMovements = movements.map((m) => ({ ...m, date: m.date.toISOString() }));
  const serializedAccounts = accounts.map((a) => ({
    ...a,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }));

  return (
    <PageContainer title="Financeiro" subtitle="Caixa da Empresa">
      <div className="space-y-6">
        <CaixaClient
          initialMovements={serializedMovements}
          initialAccounts={serializedAccounts}
          canCreate={canCreate}
          isGrupoNordMode={ctx?.mode !== "single"}
        />
      </div>
    </PageContainer>
  );
}
