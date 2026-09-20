import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { UniformesClient } from "./uniformes-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

// Mesma checagem de cargo (MANAGER_ROLES) já usada nas rotas de API irmãs de RH (desde o commit
// f109b8e) — sem ela, qualquer COLABORADOR com o Perfil de Permissão padrão "Funcionário"
// (rh:canView=true de fábrica) conseguia ver as entregas de uniforme de todos os colegas direto
// nesta página Server Component (BUG-004). Fica restrito a Administrador/Gestor/Gerente/Supervisor
// por cargo, igual ao resto do módulo RH.
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export default async function UniformesPage() {
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

  const [deliveries, employees] = await Promise.all([
    prisma.uniformDelivery.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { dataEntrega: "desc" },
      include: { employee: { select: { name: true, setor: true } } },
    }),
    prisma.employee.findMany({
      where: { empresaId: { in: empresaIds } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, setor: true },
    }),
  ]);

  const serialized = deliveries.map((d) => ({ ...d, dataEntrega: d.dataEntrega.toISOString() }));

  return (
    <PageContainer title="RH" subtitle="Uniformes">
      <UniformesClient
        initialDeliveries={serialized}
        employees={employees}
        canCreate={canCreate}
        isGrupoNordMode={ctx?.mode !== "single"}
      />
    </PageContainer>
  );
}
