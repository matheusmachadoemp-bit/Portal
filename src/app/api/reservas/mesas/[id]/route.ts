import { NextResponse } from "next/server";
import { Prisma, ReservationTableStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { RESERVAS_MANAGER_ROLES, RESERVATION_TABLE_STATUSES, isPositiveInt } from "@/lib/reservas";

const STATUSES = RESERVATION_TABLE_STATUSES as ReservationTableStatus[];

async function loadOwnedTable(id: string, empresaId: string) {
  const table = await prisma.reservationTable.findUnique({ where: { id }, include: { environment: true } });
  if (!table || table.environment.empresaId !== empresaId) return null;
  return table;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!RESERVAS_MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode alterar mesas de Reservas." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "reservas", "canEdit"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite alterar mesas de Reservas." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para alterar uma mesa." }, { status: 400 });
  }

  const { id } = await params;
  const existing = await loadOwnedTable(id, empresa.id);
  if (!existing) return NextResponse.json({ error: "Mesa não encontrada." }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });

  const data: Prisma.ReservationTableUpdateInput = {};

  if (body.identificacao !== undefined) {
    const identificacao = String(body.identificacao).trim();
    if (!identificacao) return NextResponse.json({ error: "Informe a identificação da mesa." }, { status: 400 });
    data.identificacao = identificacao;
  }
  if (body.environmentId !== undefined) {
    const environment = await prisma.reservationEnvironment.findFirst({
      where: { id: body.environmentId, empresaId: empresa.id },
      select: { id: true },
    });
    if (!environment) return NextResponse.json({ error: "Ambiente não encontrado." }, { status: 404 });
    data.environment = { connect: { id: environment.id } };
  }
  const nextCapacityMin = body.capacityMin !== undefined ? body.capacityMin : existing.capacityMin;
  const nextCapacityMax = body.capacityMax !== undefined ? body.capacityMax : existing.capacityMax;
  if (body.capacityMin !== undefined) {
    if (!isPositiveInt(body.capacityMin)) return NextResponse.json({ error: "Capacidade mínima inválida." }, { status: 400 });
    data.capacityMin = body.capacityMin;
  }
  if (body.capacityMax !== undefined) {
    if (!isPositiveInt(body.capacityMax)) return NextResponse.json({ error: "Capacidade máxima inválida." }, { status: 400 });
    data.capacityMax = body.capacityMax;
  }
  if (nextCapacityMin > nextCapacityMax) {
    return NextResponse.json({ error: "A capacidade mínima não pode ser maior que a máxima." }, { status: 400 });
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    data.status = body.status;
  }
  if (body.availableForReservation !== undefined) data.availableForReservation = !!body.availableForReservation;
  if (body.order !== undefined) {
    if (!Number.isFinite(body.order)) return NextResponse.json({ error: "Ordem inválida." }, { status: 400 });
    data.order = Math.round(body.order);
  }

  try {
    const table = await prisma.reservationTable.update({ where: { id }, data });
    return NextResponse.json({ table });
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Já existe uma mesa com essa identificação neste ambiente." }, { status: 409 });
    }
    throw err;
  }
}

/** Exclui uma mesa — só permitido se ela nunca foi usada em nenhuma reserva (sem
 * `ReservationTableAssignment`/`ReservationTableCombinationMember`); do contrário, orienta a
 * desativar (`status: "INATIVA"`) em vez de apagar, pra não perder o histórico. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!RESERVAS_MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode excluir mesas de Reservas." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "reservas", "canDelete"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite excluir mesas de Reservas." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para excluir uma mesa." }, { status: 400 });
  }

  const { id } = await params;
  const existing = await loadOwnedTable(id, empresa.id);
  if (!existing) return NextResponse.json({ error: "Mesa não encontrada." }, { status: 404 });

  const [assignmentCount, combinationMemberCount] = await Promise.all([
    prisma.reservationTableAssignment.count({ where: { tableId: id } }),
    prisma.reservationTableCombinationMember.count({ where: { tableId: id } }),
  ]);
  if (assignmentCount > 0) {
    return NextResponse.json(
      { error: "Esta mesa já foi usada em reservas e não pode ser excluída — desative-a em vez de excluir." },
      { status: 409 }
    );
  }
  if (combinationMemberCount > 0) {
    return NextResponse.json(
      { error: "Esta mesa faz parte de uma combinação cadastrada — remova-a da combinação antes de excluir." },
      { status: 409 }
    );
  }

  await prisma.reservationTable.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
