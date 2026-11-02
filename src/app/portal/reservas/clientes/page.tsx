import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { ClientesReservasClient } from "./clientes-client";

/**
 * Clientes (Etapa 4 do módulo Reservas) — lista de clientes derivada de `Reservation` (nem
 * toda reserva tem um `Cliente` formal do CRM vinculado, ver comentário em
 * `src/lib/reservas-clientes.ts`), com histórico de reservas por cliente. Só um shell de
 * servidor: a lista em si vem de `GET /api/reservas/clientes`, consumida pelo client component
 * abaixo — mesmo padrão de `src/app/portal/reservas/mesas-ambientes/page.tsx`.
 */
export default async function ReservasClientesPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "reservas", "canView"))) {
    redirect("/portal/inicio");
  }

  const empresa = await requireActiveSingleEmpresa();

  return (
    <PageContainer title="Reservas" subtitle="Clientes" backHref="/portal/reservas" backLabel="Reservas">
      <ClientesReservasClient hasEmpresa={!!empresa} />
    </PageContainer>
  );
}
