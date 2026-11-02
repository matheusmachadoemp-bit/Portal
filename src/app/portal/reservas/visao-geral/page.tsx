import { redirect } from "next/navigation";
import { format, parseISO } from "date-fns";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { StatCard, Section, Badge } from "@/components/ui/stat-card";
import { RESERVATION_STATUS_LABEL, RESERVATION_STATUS_TONE } from "@/lib/reservas";
import { getReservasResumo } from "@/lib/reservas-resumo";

/**
 * "Visão Geral" (Etapa 4 do módulo Reservas) — resumo do dia pra quem abre a tela de manhã:
 * quantas reservas hoje, quantas ainda aguardam confirmação, ocupação do dia (pessoas reservadas
 * / capacidade dos ambientes ativos) e taxa de no-show recente. Sem gráfico/elaboração extra de
 * propósito (ver prompt da tarefa) — 100% server component, sem estado de cliente: reabrir a
 * página já atualiza os números (igual o resto do app faz pra dashboards simples equivalentes).
 */
export default async function ReservasVisaoGeralPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "reservas", "canView"))) {
    redirect("/portal/inicio");
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) {
    return (
      <PageContainer title="Reservas" subtitle="Visão Geral" backHref="/portal/reservas" backLabel="Reservas">
        <div className="nord-card p-8 text-center text-sm text-nord-gray">Selecione uma loja para ver o resumo de reservas.</div>
      </PageContainer>
    );
  }

  const resumo = await getReservasResumo(empresaIdsForContext(ctx));

  return (
    <PageContainer title="Reservas" subtitle="Visão Geral" backHref="/portal/reservas" backLabel="Reservas">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Reservas hoje"
          value={String(resumo.todayCount)}
          icon="CalendarCheck"
          href="/portal/reservas/reservas"
        />
        <StatCard
          label="Pendentes de confirmação"
          value={String(resumo.pendingConfirmation)}
          icon="Hourglass"
          color="#f0b429"
          href="/portal/reservas/reservas?status=PENDENTE"
        />
        <StatCard
          label="Ocupação hoje"
          value={resumo.occupancy.percent !== null ? `${resumo.occupancy.percent.toFixed(0)}%` : "—"}
          icon="Users"
          hint={
            resumo.occupancy.totalCapacity > 0
              ? `${resumo.occupancy.reservedPartySize} de ${resumo.occupancy.totalCapacity} lugares reservados`
              : "Nenhum ambiente ativo cadastrado"
          }
        />
        <StatCard
          label="Taxa de no-show"
          value={resumo.noShow.percent !== null ? `${resumo.noShow.percent.toFixed(0)}%` : "—"}
          icon="UserX"
          color="#e5484d"
          hint={
            resumo.noShow.total > 0
              ? `${resumo.noShow.noShow} de ${resumo.noShow.total} nos últimos ${resumo.noShow.windowDays} dias`
              : `Sem reservas encerradas nos últimos ${resumo.noShow.windowDays} dias`
          }
        />
      </div>

      <Section title="Status das reservas de hoje">
        {resumo.todayCount === 0 ? (
          <p className="text-sm text-nord-gray py-2">Nenhuma reserva para hoje ainda.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {Object.entries(resumo.todayByStatus).map(([statusKey, count]) => (
              <Badge key={statusKey} tone={RESERVATION_STATUS_TONE[statusKey] ?? "default"}>
                {RESERVATION_STATUS_LABEL[statusKey] ?? statusKey}: {count}
              </Badge>
            ))}
          </div>
        )}
      </Section>

      <Section title="Próximas reservas de hoje">
        {resumo.upcomingToday.length === 0 ? (
          <p className="text-sm text-nord-gray py-2">
            {resumo.todayCount === 0
              ? "Nenhuma reserva para hoje ainda."
              : "Nenhuma reserva ainda por vir hoje (as de hoje já passaram do horário ou já foram atendidas)."}
          </p>
        ) : (
          <div className="space-y-1.5">
            {resumo.upcomingToday.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-lg border border-nord-border/60 p-2.5 flex-wrap"
              >
                <span className="text-sm text-white font-medium whitespace-nowrap">
                  {format(parseISO(r.startTime), "HH:mm")}
                </span>
                <span className="text-sm text-white min-w-0 flex-1 truncate">{r.customerName ?? "—"}</span>
                <span className="text-xs text-nord-gray whitespace-nowrap">{r.partySize} pessoas</span>
                <span className="text-xs text-nord-gray whitespace-nowrap">
                  {r.environment.name}
                  {r.tables.length > 0 && ` — ${r.tables.map((t) => t.identificacao).join(" + ")}`}
                </span>
                <Badge tone={RESERVATION_STATUS_TONE[r.status] ?? "default"}>
                  {RESERVATION_STATUS_LABEL[r.status] ?? r.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Section>
    </PageContainer>
  );
}
