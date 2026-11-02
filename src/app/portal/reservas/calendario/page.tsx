import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { getActiveEmpresaContext } from "@/lib/empresa";
import { spDateKey } from "@/lib/timezone";
import { CalendarioClient } from "./calendario-client";

/**
 * "Calendário" (Etapa 4 do módulo Reservas) — visão por mês das reservas da loja (ou lojas, em
 * modo Grupo Nord) ativa: cada dia mostra quantas reservas tem; clicar num dia lista as reservas
 * daquele dia. Só um shell de servidor — a lista do mês vem de `GET /api/reservas/reservas`
 * (mesma rota da tela "Reservas", filtrada por `dateFrom`/`dateTo`), consumida pelo client
 * component abaixo. Reaproveita `MonthCalendar` (src/components/ui/month-calendar.tsx) para a
 * grade em si, sem reimplementar navegação de mês.
 */
export default async function ReservasCalendarioPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "reservas", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();

  return (
    <PageContainer title="Reservas" subtitle="Calendário" backHref="/portal/reservas" backLabel="Reservas">
      <CalendarioClient hasEmpresa={!!ctx} multiEmpresa={ctx?.mode === "grupo"} todayKey={spDateKey()} />
    </PageContainer>
  );
}
