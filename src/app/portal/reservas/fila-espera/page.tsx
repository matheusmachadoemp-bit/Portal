import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { RESERVAS_MANAGER_ROLES } from "@/lib/reservas";
import { FilaEsperaClient } from "./fila-espera-client";

/**
 * Fila de Espera (Etapa 4 do módulo Reservas) — CRUD administrativo de clientes aguardando uma
 * mesa (ver comentário de modelagem no `prisma/schema.prisma` acima de `model
 * ReservationWaitlistEntry`). Mesmo nível de acabamento das outras telas administrativas do
 * módulo (Configurações, Ambientes): só um shell de servidor — a lista em si vem da rota
 * `/api/reservas/fila-espera`, consumida pelo client component abaixo.
 */
export default async function ReservasFilaEsperaPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "reservas", "canView"))) {
    redirect("/portal/inicio");
  }

  // Trava dupla de cargo (igual à tela "Reservas", reservas/page.tsx): só os cargos de
  // `RESERVAS_MANAGER_ROLES` administram o módulo por padrão, mesmo que `hasModulePermission`
  // devolva `true` por algum `UserPermission` manual — ver comentário em `RESERVAS_MANAGER_ROLES`
  // (src/lib/reservas.ts) sobre essa trava ser intencional e não redundante.
  const isManagerRole = RESERVAS_MANAGER_ROLES.includes(session.user.role);
  const [canCreate, canEdit, canDelete, empresa] = await Promise.all([
    hasModulePermission(session.user.id, "reservas", "canCreate"),
    hasModulePermission(session.user.id, "reservas", "canEdit"),
    hasModulePermission(session.user.id, "reservas", "canDelete"),
    requireActiveSingleEmpresa(),
  ]);

  return (
    <PageContainer title="Reservas" subtitle="Fila de Espera" backHref="/portal/reservas" backLabel="Reservas">
      <FilaEsperaClient
        canCreate={isManagerRole && canCreate}
        canEdit={isManagerRole && canEdit}
        canDelete={isManagerRole && canDelete}
        hasEmpresa={!!empresa}
      />
    </PageContainer>
  );
}
