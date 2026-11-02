import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { PageContainer } from "@/components/page-container";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { StatCard, Section, Badge } from "@/components/ui/stat-card";
import { RESERVATION_STATUS_LABEL, RESERVATION_STATUS_TONE } from "@/lib/reservas";
import { getReservasResumo } from "@/lib/reservas-resumo";
import { spHours, spMinutes } from "@/lib/checklist";
import { RelatoriosPeriodoSection } from "./relatorios-periodo-client";

/**
 * "Visão Geral" (Etapa 4 do módulo Reservas) — resumo do dia pra quem abre a tela de manhã:
 * quantas reservas hoje, quantas ainda aguardam confirmação, ocupação do dia (pessoas reservadas
 * / capacidade dos ambientes ativos) e taxa de no-show recente. 100% server component pra esse
 * bloco de cima, sem estado de cliente: reabrir a página já atualiza os números (igual o resto do
 * app faz pra dashboards simples equivalentes).
 *
 * A partir da tarefa "reservas-unificar-visao-relatorios" (pedido do usuário: juntar a
 * subcategoria "Relatórios" com "Visão Geral" — ver prisma/migrations/
 * 20261102030000_remove_relatorios_subcategoria_reservas), esta mesma tela também mostra, abaixo
 * do resumo do dia, a seção "Relatório por período" (agregados sobre `Reservation` num intervalo
 * de datas — total de reservas, taxa de no-show/cancelamento, ocupação por ambiente, horários de
 * pico) que antes vivia em `/portal/reservas/relatorios` (rota removida). Essa seção é client
 * component (`RelatoriosPeriodoSection`, em "./relatorios-periodo-client") porque depende do
 * filtro de período controlado pelo usuário; o resumo do dia continua puramente server-rendered.
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
  // O relatório por período (GET /api/reservas/relatorios) só é calculado pra UMA loja
  // específica, nunca em modo "Grupo Nord" consolidado (mesma regra de sempre dessa rota —
  // ver `requireActiveSingleEmpresa` em src/lib/empresa.ts) — mesmo que o resumo do dia acima
  // funcione normalmente agregando várias lojas.
  const hasSingleEmpresa = ctx.mode === "single";

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
          // `pendingConfirmation` conta PENDENTE de hoje em diante, sem teto de data (ver
          // `getReservasResumo`) — manda `dateFrom` (sem `dateTo`) pra tela de Reservas abrir com
          // o mesmo intervalo aberto, em vez de cair no padrão "só hoje" dela e esconder pendente
          // de dia futuro sem aviso nenhum (achado confirmado pelo Teulis).
          href={`/portal/reservas/reservas?status=PENDENTE&dateFrom=${resumo.dateKey}`}
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
            {resumo.upcomingToday.map((r) => {
              // Horário sempre no fuso de São Paulo (`spHours`/`spMinutes`, em `@/lib/checklist`),
              // nunca `.getHours()`/`format` puro num `Date`: o servidor (Vercel) roda em UTC, e
              // ler a hora "crua" adiantaria 3h o que aparece aqui (mesmo cuidado já documentado
              // em `buildReservationEmailDetails`, src/app/api/reservas/reservas/[id]/route.ts).
              const start = new Date(r.startTime);
              const hhmm = `${String(spHours(start)).padStart(2, "0")}:${String(spMinutes(start)).padStart(2, "0")}`;
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-3 rounded-lg border border-nord-border/60 p-2.5 flex-wrap"
                >
                  <span className="text-sm text-white font-medium whitespace-nowrap">{hhmm}</span>
                  <span className="text-sm text-white min-w-0 flex-1 truncate">{r.customerName ?? "—"}</span>
                  <span className="text-xs text-nord-gray whitespace-nowrap">{r.partySize} pessoas</span>
                  <span className="text-xs text-nord-gray whitespace-nowrap">{r.environment.name}</span>
                  <Badge tone={RESERVATION_STATUS_TONE[r.status] ?? "default"}>
                    {RESERVATION_STATUS_LABEL[r.status] ?? r.status}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <div className="flex items-center gap-3 pt-2">
        <h2 className="text-white font-semibold text-base whitespace-nowrap">Relatório por período</h2>
        <div className="h-px flex-1 bg-nord-border/60" />
      </div>
      <RelatoriosPeriodoSection hasEmpresa={hasSingleEmpresa} />
    </PageContainer>
  );
}
