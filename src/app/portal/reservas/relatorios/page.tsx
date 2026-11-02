import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { RelatoriosReservasClient } from "./relatorios-client";

/**
 * Relatórios (Etapa 4 do módulo Reservas) — agregados sobre `Reservation` num período (total de
 * reservas, taxa de não comparecimento/cancelamento, tamanho médio de grupo, ocupação média por
 * ambiente e horários de pico). Só um shell de servidor: os números vêm de
 * `GET /api/reservas/relatorios`, consumida pelo client component abaixo — mesmo padrão de
 * `src/app/portal/reservas/mesas-ambientes/page.tsx`.
 */
export default async function ReservasRelatoriosPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "reservas", "canView"))) {
    redirect("/portal/inicio");
  }

  const empresa = await requireActiveSingleEmpresa();

  return (
    <PageContainer title="Reservas" subtitle="Relatórios" backHref="/portal/reservas" backLabel="Reservas">
      <RelatoriosReservasClient hasEmpresa={!!empresa} />
    </PageContainer>
  );
}
