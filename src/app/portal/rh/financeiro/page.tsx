import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { AccessDenied } from "@/components/ui/access-denied";
import { FinanceiroClient } from "./financeiro-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

// Mesma checagem de cargo (MANAGER_ROLES) já usada pela rota de API irmã (`/api/rh/finance`, desde
// o commit f109b8e) — sem ela, qualquer COLABORADOR com o Perfil de Permissão padrão "Funcionário"
// (rh:canView=true de fábrica) conseguia ver todos os lançamentos financeiros (vale/adiantamento/
// desconto) de todos os colegas direto nesta página Server Component (BUG-004). Fica restrito a
// Administrador/Gestor/Gerente/Supervisor por cargo, igual à API.
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export default async function FinanceiroPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/portal/inicio");
  }
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return (
      <PageContainer title="RH" subtitle="Financeiro">
        <AccessDenied message="Esta página reúne os lançamentos financeiros (vale, adiantamento, desconto) de todos os colaboradores e por isso é restrita a Administrador, Gestor, Gerente ou Supervisor. Se você precisa desse acesso, fale com seu gestor." />
      </PageContainer>
    );
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canManageRh = await hasModulePermission(session.user.id, "rh", "canCreate");
  const canCreate = ctx?.mode === "single" && canManageRh;

  const [entries, employees] = await Promise.all([
    prisma.employeeFinanceEntry.findMany({
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
    <PageContainer title="RH" subtitle="Financeiro">
      <FinanceiroClient
        initialEntries={serialized}
        employees={employees}
        canCreate={canCreate}
        isGrupoNordMode={ctx?.mode !== "single"}
      />
    </PageContainer>
  );
}
