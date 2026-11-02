import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { FilaEsperaClient } from "./fila-espera-client";

/**
 * Fila de Espera (Etapa 4 do módulo Reservas) — CRUD administrativo de clientes aguardando uma
 * mesa (ver comentário de modelagem no `prisma/schema.prisma` acima de `model
 * ReservationWaitlistEntry`). Mesmo nível de acabamento das outras telas administrativas do
 * módulo (Configurações, Mesas e Ambientes): só um shell de servidor — a lista em si vem da rota
 * `/api/reservas/fila-espera`, consumida pelo client component abaixo.
 */
export default async function ReservasFilaEsperaPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "reservas", "canView"))) {
    redirect("/portal/inicio");
  }

  const [canCreate, canEdit, canDelete, empresa] = await Promise.all([
    hasModulePermission(session.user.id, "reservas", "canCreate"),
    hasModulePermission(session.user.id, "reservas", "canEdit"),
    hasModulePermission(session.user.id, "reservas", "canDelete"),
    requireActiveSingleEmpresa(),
  ]);

  return (
    <PageContainer title="Reservas" subtitle="Fila de Espera" backHref="/portal/reservas" backLabel="Reservas">
      <FilaEsperaClient canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} hasEmpresa={!!empresa} />
    </PageContainer>
  );
}
