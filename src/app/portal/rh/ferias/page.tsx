import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { FeriasClient } from "./ferias-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

// Mesma checagem de cargo (MANAGER_ROLES) já usada pela rota de API irmã (`/api/rh/vacations`,
// desde o commit f109b8e) — sem ela, qualquer COLABORADOR com o Perfil de Permissão padrão
// "Funcionário" (rh:canView=true de fábrica) conseguia ver as férias de todos os colegas direto
// nesta página Server Component (BUG-004). Fica restrito a Administrador/Gestor/Gerente/Supervisor
// por cargo, igual à API.
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export default async function FeriasPage() {
  const session = await auth();
  if (!session?.user || !MANAGER_ROLES.includes(session.user.role)) {
    redirect("/portal/inicio");
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  const empresaIds = ctx ? empresaIdsForContext(ctx) : [];
  const canManageRh = await hasModulePermission(session.user.id, "rh", "canCreate");
  const canCreate = ctx?.mode === "single" && canManageRh;

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
      <FeriasClient
        initialVacations={serialized}
        employees={employees}
        canCreate={canCreate}
        isGrupoNordMode={ctx?.mode !== "single"}
      />
    </PageContainer>
  );
}
