import { prisma } from "@/lib/prisma";
import type { ReservationStatus } from "@prisma/client";
import { spDateKey, spStartOfDay } from "@/lib/timezone";
import { RESERVATION_OCCUPYING_STATUSES } from "@/lib/reservas-disponibilidade";

/**
 * Resumo do dia para a tela "Visão Geral" (Etapa 4 do módulo Reservas) — consumido tanto pelo
 * server component da própria tela (`src/app/portal/reservas/visao-geral/page.tsx`, sem round
 * trip de API) quanto por `GET /api/reservas/resumo` (botão "Atualizar" do lado cliente), pra
 * nunca duplicar a lógica de agregação entre os dois. Sempre escopado por `empresaIds` (uma loja,
 * ou todas em modo Grupo Nord — ver `empresaIdsForContext`), nunca calculado sem esse filtro.
 */

export type ReservaResumoUpcoming = {
  id: string;
  startTime: string;
  endTime: string;
  partySize: number;
  status: ReservationStatus;
  customerName: string | null;
  customerPhone: string | null;
  environment: { id: string; name: string };
  tables: { id: string; identificacao: string }[];
};

export type ReservasResumo = {
  dateKey: string;
  todayCount: number;
  todayByStatus: Record<string, number>;
  upcomingToday: ReservaResumoUpcoming[];
  pendingConfirmation: number;
  occupancy: { reservedPartySize: number; totalCapacity: number; percent: number | null };
  noShow: { windowDays: number; total: number; noShow: number; percent: number | null };
};

/** Janela de dias (sempre encerrados — nunca inclui hoje, que ainda pode mudar de status) usada
 * para calcular a taxa de no-show recente — sem sugestão numérica de nenhum documento original;
 * 30 dias é um recorte razoável pra "recente" sem ficar sensível demais a um único dia ruim. */
const NO_SHOW_WINDOW_DAYS = 30;

export async function getReservasResumo(empresaIds: string[]): Promise<ReservasResumo> {
  const dateKey = spDateKey();
  const todayStart = spStartOfDay(dateKey);
  const windowStart = new Date(todayStart.getTime() - NO_SHOW_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const now = new Date();

  const [todayReservations, environments, pendingConfirmation, noShowWindow] = await Promise.all([
    prisma.reservation.findMany({
      where: { empresaId: { in: empresaIds }, date: todayStart },
      select: {
        id: true,
        status: true,
        startTime: true,
        endTime: true,
        partySize: true,
        customerName: true,
        customerPhone: true,
        environment: { select: { id: true, name: true } },
        tables: { select: { table: { select: { id: true, identificacao: true } } } },
      },
      orderBy: { startTime: "asc" },
    }),
    prisma.reservationEnvironment.findMany({
      where: { empresaId: { in: empresaIds }, active: true },
      select: { capacity: true },
    }),
    // "Pendente de confirmação" olha pra frente (hoje em diante) — uma PENDENTE de um dia que já
    // passou não tem mais nada a "confirmar" de verdade (fora de escopo liberar/arquivar
    // automaticamente; só não entra nesta contagem).
    prisma.reservation.count({
      where: { empresaId: { in: empresaIds }, status: "PENDENTE", date: { gte: todayStart } },
    }),
    // Taxa de no-show: só reservas de dias JÁ ENCERRADOS (antes de hoje) cujo status final já é
    // definitivo (FINALIZADA ou NAO_COMPARECEU) — CANCELADA fica de fora de propósito (cancelar
    // não é a mesma coisa que não comparecer).
    prisma.reservation.findMany({
      where: {
        empresaId: { in: empresaIds },
        date: { gte: windowStart, lt: todayStart },
        status: { in: ["FINALIZADA", "NAO_COMPARECEU"] },
      },
      select: { status: true },
    }),
  ]);

  const todayByStatus: Record<string, number> = {};
  for (const r of todayReservations) {
    todayByStatus[r.status] = (todayByStatus[r.status] ?? 0) + 1;
  }

  const occupyingToday = todayReservations.filter((r) => RESERVATION_OCCUPYING_STATUSES.includes(r.status));
  const reservedPartySize = occupyingToday.reduce((sum, r) => sum + r.partySize, 0);
  const totalCapacity = environments.reduce((sum, e) => sum + e.capacity, 0);

  const upcomingToday: ReservaResumoUpcoming[] = occupyingToday
    .filter((r) => r.startTime >= now)
    .slice(0, 8)
    .map((r) => ({
      id: r.id,
      startTime: r.startTime.toISOString(),
      endTime: r.endTime.toISOString(),
      partySize: r.partySize,
      status: r.status,
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      environment: r.environment,
      tables: r.tables.map((t) => t.table),
    }));

  const noShowTotal = noShowWindow.length;
  const noShowCount = noShowWindow.filter((r) => r.status === "NAO_COMPARECEU").length;

  return {
    dateKey,
    todayCount: todayReservations.length,
    todayByStatus,
    upcomingToday,
    pendingConfirmation,
    occupancy: {
      reservedPartySize,
      totalCapacity,
      percent: totalCapacity > 0 ? (reservedPartySize / totalCapacity) * 100 : null,
    },
    noShow: {
      windowDays: NO_SHOW_WINDOW_DAYS,
      total: noShowTotal,
      noShow: noShowCount,
      percent: noShowTotal > 0 ? (noShowCount / noShowTotal) * 100 : null,
    },
  };
}
