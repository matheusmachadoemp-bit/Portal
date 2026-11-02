// Reservas — Etapa 4 (tela administrativa "Relatórios"). Arquivo novo e isolado (ver mesmo
// racional em `src/lib/reservas-clientes.ts`) — só LÊ `Reservation`/`ReservationEnvironment`,
// nenhuma mudança de schema.

import { prisma } from "@/lib/prisma";
import { pct } from "@/lib/calc";
import { SP_OFFSET_HOURS } from "@/lib/timezone";

export type OcupacaoAmbiente = {
  environmentId: string;
  name: string;
  capacity: number;
  totalPessoas: number;
  totalReservas: number;
  /** Pessoas reservadas ÷ (capacidade do ambiente × dias do período) × 100 — pode passar de 100%
   * quando há mais de um giro de mesa por dia (o motor de disponibilidade libera a mesa de novo
   * depois de `endTime` + tempo de limpeza, ver `ReservationSettings.cleaningMinutes`). Só conta
   * reservas que de fato ocuparam mesa (exclui `CANCELADA`/`NAO_COMPARECEU`). */
  ocupacaoPercent: number;
};

export type HorarioPicoPoint = { hour: string; total: number };

export type ReservasReportSummary = {
  totalReservas: number;
  noShowCount: number;
  noShowRate: number;
  canceladaCount: number;
  cancelamentoRate: number;
  tamanhoMedioGrupo: number;
  ocupacaoPorAmbiente: OcupacaoAmbiente[];
  horariosPico: HorarioPicoPoint[];
};

/** Hora do dia (0-23) de um instante, no fuso de São Paulo — mesmo offset fixo de `spDateKey`
 * (src/lib/timezone.ts), só que devolvendo a HORA em vez do dia (sem duplicar a lógica de fuso,
 * já que o próprio `SP_OFFSET_HOURS` é importado dali). */
function spHour(date: Date): number {
  return new Date(date.getTime() - SP_OFFSET_HOURS * 60 * 60 * 1000).getUTCHours();
}

/** Reservas que não representam uso real da mesa — excluídas do cálculo de ocupação por
 * ambiente (contá-las infla a ocupação com gente que nunca sentou). */
const NAO_OCUPOU_MESA = new Set(["CANCELADA", "NAO_COMPARECEU"]);

/** Remove horas vazias nas pontas do array de 24h (mantendo 1h de contexto de cada lado) para o
 * gráfico de horários de pico não ficar poluído de barras zeradas fora do horário de
 * funcionamento (ex.: restaurante que só abre à noite não precisa mostrar 0h-11h vazias). Sem
 * nenhuma reserva no período inteiro, devolve o array cheio — o componente de gráfico já trata
 * "tudo zero" como estado vazio (`isChartDataEmpty`). */
function trimEmptyEdges(points: HorarioPicoPoint[]): HorarioPicoPoint[] {
  const firstIdx = points.findIndex((p) => p.total > 0);
  if (firstIdx === -1) return points;
  let lastIdx = points.length - 1;
  while (lastIdx > firstIdx && points[lastIdx].total === 0) lastIdx -= 1;
  const start = Math.max(0, firstIdx - 1);
  const end = Math.min(points.length - 1, lastIdx + 1);
  return points.slice(start, end + 1);
}

/**
 * Agrega as reservas de uma empresa num período (`date` entre `from`/`to`, ambos já âncoras de
 * dia de São Paulo — ver `src/lib/periods.ts`) numa única consulta por tabela (sem N+1): uma
 * busca de `Reservation` + uma busca de `ReservationEnvironment` (para incluir ambientes sem
 * nenhuma reserva no período, com 0% de ocupação, em vez de simplesmente omiti-los do gráfico).
 */
export async function computeReservasReport(empresaId: string, from: Date, to: Date): Promise<ReservasReportSummary> {
  const [reservations, environments] = await Promise.all([
    prisma.reservation.findMany({
      where: { empresaId, date: { gte: from, lte: to } },
      select: { partySize: true, status: true, startTime: true, environmentId: true },
    }),
    prisma.reservationEnvironment.findMany({
      where: { empresaId, active: true },
      select: { id: true, name: true, capacity: true },
      orderBy: { order: "asc" },
    }),
  ]);

  const totalReservas = reservations.length;
  const noShowCount = reservations.filter((r) => r.status === "NAO_COMPARECEU").length;
  const canceladaCount = reservations.filter((r) => r.status === "CANCELADA").length;
  const tamanhoMedioGrupo = totalReservas
    ? reservations.reduce((acc, r) => acc + r.partySize, 0) / totalReservas
    : 0;

  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));

  const porAmbiente = new Map<string, { totalPessoas: number; totalReservas: number }>();
  for (const r of reservations) {
    if (NAO_OCUPOU_MESA.has(r.status)) continue;
    const acc = porAmbiente.get(r.environmentId) ?? { totalPessoas: 0, totalReservas: 0 };
    acc.totalPessoas += r.partySize;
    acc.totalReservas += 1;
    porAmbiente.set(r.environmentId, acc);
  }
  const ocupacaoPorAmbiente: OcupacaoAmbiente[] = environments.map((e) => {
    const acc = porAmbiente.get(e.id) ?? { totalPessoas: 0, totalReservas: 0 };
    const capacidadeTotalPeriodo = e.capacity * days;
    return {
      environmentId: e.id,
      name: e.name,
      capacity: e.capacity,
      totalPessoas: acc.totalPessoas,
      totalReservas: acc.totalReservas,
      ocupacaoPercent: capacidadeTotalPeriodo > 0 ? (acc.totalPessoas / capacidadeTotalPeriodo) * 100 : 0,
    };
  });

  // Horários de pico: sinal de demanda (quando o cliente PEDIU aquele horário), por isso só
  // exclui `CANCELADA` — `NAO_COMPARECEU` continua contando (o pedido de horário existiu, só não
  // foi honrado), diferente da ocupação acima (que mede uso real da mesa).
  const hourCounts = new Map<number, number>();
  for (const r of reservations) {
    if (r.status === "CANCELADA") continue;
    const hour = spHour(r.startTime);
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
  }
  const horariosPicoCompleto: HorarioPicoPoint[] = Array.from({ length: 24 }, (_, hour) => ({
    hour: `${String(hour).padStart(2, "0")}h`,
    total: hourCounts.get(hour) ?? 0,
  }));

  return {
    totalReservas,
    noShowCount,
    noShowRate: pct(noShowCount, totalReservas),
    canceladaCount,
    cancelamentoRate: pct(canceladaCount, totalReservas),
    tamanhoMedioGrupo,
    ocupacaoPorAmbiente,
    horariosPico: trimEmptyEdges(horariosPicoCompleto),
  };
}
