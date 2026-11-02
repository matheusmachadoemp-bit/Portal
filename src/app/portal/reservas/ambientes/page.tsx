import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { RESERVAS_MANAGER_ROLES } from "@/lib/reservas";
import { AmbientesClient } from "./ambientes-client";

/**
 * Ambientes (Etapa 2 do módulo Reservas) — CRUD funcional de Ambientes. Até a tarefa
 * "reservas-remover-mesas" esta pasta se chamava `mesas-ambientes` e também cadastrava mesas e
 * combinações de mesas — removidas por completo (ver comentário de redesign em
 * `prisma/schema.prisma` acima de `model ReservationEnvironment`): o motor de disponibilidade
 * controla só a capacidade TOTAL do ambiente, sem rastrear mesa nenhuma. Só um shell de servidor:
 * a lista em si vem da rota `/api/reservas/ambientes`, consumida pelo client component abaixo.
 */
export default async function ReservasAmbientesPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "reservas", "canView"))) {
    redirect("/portal/inicio");
  }

  // Trava dupla de cargo (igual à tela "Reservas", reservas/page.tsx): só os cargos de
  // `RESERVAS_MANAGER_ROLES` administram o módulo por padrão, mesmo que `hasModulePermission`
  // devolva `true` por algum `UserPermission` manual — ver comentário em `RESERVAS_MANAGER_ROLES`
  // (src/lib/reservas.ts) sobre essa trava ser intencional e não redundante.
  const isManagerRole = RESERVAS_MANAGER_ROLES.includes(session.user.role);
  const [canCreate, canEdit, empresa] = await Promise.all([
    hasModulePermission(session.user.id, "reservas", "canCreate"),
    hasModulePermission(session.user.id, "reservas", "canEdit"),
    requireActiveSingleEmpresa(),
  ]);

  return (
    <PageContainer title="Reservas" subtitle="Ambientes" backHref="/portal/reservas" backLabel="Reservas">
      <AmbientesClient canCreate={isManagerRole && canCreate} canEdit={isManagerRole && canEdit} hasEmpresa={!!empresa} />
    </PageContainer>
  );
}
