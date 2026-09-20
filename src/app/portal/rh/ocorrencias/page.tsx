import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { OcorrenciasClient } from "./ocorrencias-client";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";

// Mesma checagem de cargo (MANAGER_ROLES) já usada pela rota de API irmã (`/api/rh/occurrences`,
// desde o commit f109b8e) — sem ela, qualquer COLABORADOR com o Perfil de Permissão padrão
// "Funcionário" (rh:canView=true de fábrica) conseguia ver todas as ocorrências disciplinares de
// todos os colegas direto nesta página Server Component (BUG-004). Fica restrito a
// Administrador/Gestor/Gerente/Supervisor por cargo, igual à API.
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export default async function OcorrenciasPage() {
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

  const [occurrences, employees] = await Promise.all([
    prisma.occurrence.findMany({
      where: { employee: { empresaId: { in: empresaIds } } },
      orderBy: { date: "desc" },
      include: {
        employee: { select: { id: true, name: true, setor: true } },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.employee.findMany({ where: { empresaId: { in: empresaIds } }, orderBy: { name: "asc" } }),
  ]);

  const serialized = occurrences.map((o) => ({
    ...o,
    date: o.date.toISOString(),
    prazo: o.prazo ? o.prazo.toISOString() : null,
    createdAt: o.createdAt.toISOString(),
  }));

  return (
    <PageContainer title="RH" subtitle="Ocorrências disciplinares e da rotina">
      <OcorrenciasClient
        initialOccurrences={serialized}
        employees={employees.map((e) => ({ id: e.id, name: e.name, setor: e.setor }))}
        canCreate={canCreate}
        isGrupoNordMode={ctx?.mode !== "single"}
      />
    </PageContainer>
  );
}
