import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { getActiveEmpresaContext } from "@/lib/empresa";
import { RESERVAS_MANAGER_ROLES } from "@/lib/reservas";
import { spDateKey } from "@/lib/timezone";
import { ReservasClient } from "./reservas-client";

/**
 * Tela "Reservas" (Etapa 4 do módulo Reservas) — lista/gerenciamento das reservas da loja (ou
 * lojas, em modo Grupo Nord — só leitura nesse modo, ver `canEdit` abaixo) ativa. Só um shell de
 * servidor: a lista em si vem de `GET /api/reservas/reservas`, consumida pelo client component.
 */
export default async function ReservasListaPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; dateFrom?: string; dateTo?: string }>;
}) {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "reservas", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  // Mudar status é uma escrita (igual ambientes) — só permitida com uma loja única ativa, nunca
  // em modo Grupo Nord consolidado (ver `requireActiveSingleEmpresa` na rota
  // `PATCH /api/reservas/reservas/[id]`).
  const isManagerRole = RESERVAS_MANAGER_ROLES.includes(session.user.role);
  const canEdit = ctx?.mode === "single" && isManagerRole && (await hasModulePermission(session.user.id, "reservas", "canEdit"));
  // Criar reserva manualmente (`POST /api/reservas/reservas`) é escopada igual: mesma dupla
  // trava de cargo + permissão de módulo das demais escritas de Reservas, só com loja única ativa.
  const canCreate = ctx?.mode === "single" && isManagerRole && (await hasModulePermission(session.user.id, "reservas", "canCreate"));

  const { status, dateFrom, dateTo } = await searchParams;

  return (
    <PageContainer title="Reservas" subtitle="Reservas" backHref="/portal/reservas" backLabel="Reservas">
      <ReservasClient
        canEdit={canEdit}
        canCreate={canCreate}
        hasEmpresa={!!ctx}
        multiEmpresa={ctx?.mode === "grupo"}
        todayKey={spDateKey()}
        initialStatus={status ?? ""}
        initialDateFrom={dateFrom ?? ""}
        initialDateTo={dateTo ?? ""}
      />
    </PageContainer>
  );
}
