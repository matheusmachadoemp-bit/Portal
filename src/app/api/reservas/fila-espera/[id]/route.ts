import { NextResponse } from "next/server";
import { ReservationWaitlistStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { RESERVAS_MANAGER_ROLES, RESERVATION_WAITLIST_STATUSES, isPositiveInt, isValidHHMM, onlyDigits } from "@/lib/reservas";
import { serializeWaitlistEntry } from "@/lib/reservas-server";
import { parseDateKey, spStartOfDay } from "@/lib/timezone";

const STATUSES = RESERVATION_WAITLIST_STATUSES as ReservationWaitlistStatus[];
const NAME_MAX_LENGTH = 120;
const NOTES_MAX_LENGTH = 500;

async function loadOwnedEntry(id: string, empresaId: string) {
  return prisma.reservationWaitlistEntry.findFirst({ where: { id, empresaId } });
}

/** Edita campos e/ou muda o status de uma entrada da fila de espera. `CONVERTIDO_EM_RESERVA` é
 * só um status marcado manualmente pelo atendente — ver comentário no `prisma/schema.prisma`
 * acima de `model ReservationWaitlistEntry` (sem criação automática de `Reservation` nesta
 * etapa). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!RESERVAS_MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode alterar a fila de espera." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "reservas", "canEdit"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite alterar a fila de espera." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para alterar a fila de espera." }, { status: 400 });
  }

  const { id } = await params;
  const existing = await loadOwnedEntry(id, empresa.id);
  if (!existing) return NextResponse.json({ error: "Entrada não encontrada." }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });

  const data: {
    customerName?: string;
    customerPhone?: string;
    partySize?: number;
    desiredDate?: Date;
    desiredTime?: string | null;
    notes?: string | null;
    status?: ReservationWaitlistStatus;
  } = {};

  if (body.customerName !== undefined) {
    const customerName = String(body.customerName).trim();
    if (!customerName) return NextResponse.json({ error: "Informe o nome do cliente." }, { status: 400 });
    if (customerName.length > NAME_MAX_LENGTH) return NextResponse.json({ error: "Nome muito longo." }, { status: 400 });
    data.customerName = customerName;
  }

  if (body.customerPhone !== undefined) {
    const customerPhone = onlyDigits(String(body.customerPhone));
    if (customerPhone.length < 10 || customerPhone.length > 11) {
      return NextResponse.json({ error: "Informe um telefone válido, com DDD." }, { status: 400 });
    }
    data.customerPhone = customerPhone;
  }

  if (body.partySize !== undefined) {
    if (!isPositiveInt(body.partySize)) {
      return NextResponse.json({ error: "Informe a quantidade de pessoas (inteiro maior que zero)." }, { status: 400 });
    }
    data.partySize = body.partySize;
  }

  if (body.desiredDate !== undefined) {
    const dateKey = parseDateKey(body.desiredDate);
    if (!dateKey) return NextResponse.json({ error: "Informe uma data desejada válida (AAAA-MM-DD)." }, { status: 400 });
    data.desiredDate = spStartOfDay(dateKey);
  }

  if (body.desiredTime !== undefined) {
    if (body.desiredTime === null || body.desiredTime === "") {
      data.desiredTime = null;
    } else if (!isValidHHMM(body.desiredTime)) {
      return NextResponse.json({ error: "Horário desejado inválido." }, { status: 400 });
    } else {
      data.desiredTime = body.desiredTime;
    }
  }

  if (body.notes !== undefined) {
    data.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, NOTES_MAX_LENGTH) : null;
  }

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    data.status = body.status;
  }

  const entry = await prisma.reservationWaitlistEntry.update({ where: { id }, data });
  return NextResponse.json({ entry: serializeWaitlistEntry(entry) });
}

/** Remove de vez uma entrada da fila de espera — diferente de `ReservationTable` (que bloqueia a
 * exclusão quando já tem histórico vinculado), aqui não há nenhuma outra tabela referenciando a
 * entrada, então excluir sempre é seguro; cancelar via `status: "CANCELADO"` (PATCH) é a opção
 * para manter o histórico, à escolha do atendente. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!RESERVAS_MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode excluir entradas da fila de espera." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "reservas", "canDelete"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite excluir entradas da fila de espera." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para excluir uma entrada." }, { status: 400 });
  }

  const { id } = await params;
  const existing = await loadOwnedEntry(id, empresa.id);
  if (!existing) return NextResponse.json({ error: "Entrada não encontrada." }, { status: 404 });

  await prisma.reservationWaitlistEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
