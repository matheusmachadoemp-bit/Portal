import { NextResponse } from "next/server";
import type { ReservationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { RESERVAS_MANAGER_ROLES, RESERVATION_STATUS_TRANSITIONS, RESERVATION_STATUSES } from "@/lib/reservas";

const STATUSES = RESERVATION_STATUSES as ReservationStatus[];

const RESERVATION_INCLUDE = {
  empresa: { select: { id: true, name: true, color: true } },
  environment: { select: { id: true, name: true } },
  cliente: { select: { id: true, nome: true } },
};

function serialize(r: Awaited<ReturnType<typeof loadOwnedReservation>>) {
  if (!r) return null;
  return {
    id: r.id,
    confirmationCode: r.confirmationCode,
    date: r.date.toISOString(),
    startTime: r.startTime.toISOString(),
    endTime: r.endTime.toISOString(),
    partySize: r.partySize,
    status: r.status,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    customerEmail: r.customerEmail,
    cliente: r.cliente,
    empresa: r.empresa,
    environment: r.environment,
  };
}

async function loadOwnedReservation(id: string, empresaId: string) {
  const reservation = await prisma.reservation.findUnique({ where: { id }, include: RESERVATION_INCLUDE });
  if (!reservation || reservation.empresaId !== empresaId) return null;
  return reservation;
}

/**
 * Muda o status de uma reserva (Etapa 4 — tela "Reservas"). Nunca edita data/horário — ajustar
 * esses dados é fora de escopo desta etapa (a reserva precisaria passar pelo motor de
 * disponibilidade de novo para não criar conflito; por ora, reagendar significa cancelar e criar
 * outra).
 *
 * Mesmo padrão de dupla trava de `src/app/api/reservas/ambientes/[id]/route.ts` (cargo +
 * permissão de módulo) e mesmo padrão de empresa única ativa (sem Grupo Nord) dos outros `PATCH`
 * de Reservas.
 *
 * Libera a capacidade ocupada pela reserva automaticamente ao mudar para um status terminal
 * (CANCELADA/NAO_COMPARECEU/FINALIZADA): o motor de disponibilidade
 * (`RESERVATION_OCCUPYING_STATUSES`, `src/lib/reservas-disponibilidade.ts`) já considera só os
 * status PENDENTE/CONFIRMADA/CLIENTE_CHEGOU/ACOMODADO como "ocupando" capacidade do ambiente —
 * mudar o status já é suficiente para essa capacidade voltar a aparecer livre pro motor.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!RESERVAS_MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode alterar reservas." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "reservas", "canEdit"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite alterar reservas." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para alterar uma reserva." }, { status: 400 });
  }

  const { id } = await params;
  const existing = await loadOwnedReservation(id, empresa.id);
  if (!existing) return NextResponse.json({ error: "Reserva não encontrada." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (typeof status !== "string" || !STATUSES.includes(status as ReservationStatus)) {
    return NextResponse.json({ error: "Status inválido." }, { status: 400 });
  }

  const allowed = RESERVATION_STATUS_TRANSITIONS[existing.status] ?? [];
  if (!allowed.includes(status)) {
    return NextResponse.json(
      { error: `Não é possível mudar de "${existing.status}" para "${status}".` },
      { status: 400 }
    );
  }

  const updated = await prisma.reservation.update({
    where: { id },
    data: { status: status as ReservationStatus },
    include: RESERVATION_INCLUDE,
  });

  return NextResponse.json({ reservation: serialize(updated) });
}
