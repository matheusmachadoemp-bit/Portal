import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { RESERVAS_MANAGER_ROLES } from "@/lib/reservas";

async function loadOwnedCombination(id: string, empresaId: string) {
  const combination = await prisma.reservationTableCombination.findUnique({ where: { id } });
  if (!combination || combination.empresaId !== empresaId) return null;
  return combination;
}

/** Editar nome/ativo, ou substituir o conjunto de mesas, de uma combinação (ver GET/POST em
 * `src/app/api/reservas/combinacoes/route.ts`). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!RESERVAS_MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode alterar combinações de mesas de Reservas." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "reservas", "canEdit"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite alterar combinações de mesas de Reservas." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para alterar uma combinação de mesas." }, { status: 400 });
  }

  const { id } = await params;
  const existing = await loadOwnedCombination(id, empresa.id);
  if (!existing) return NextResponse.json({ error: "Combinação não encontrada." }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });

  if (body.tableIds !== undefined) {
    const tableIds: unknown = body.tableIds;
    if (!Array.isArray(tableIds) || tableIds.length < 2 || !tableIds.every((t) => typeof t === "string")) {
      return NextResponse.json({ error: "Selecione ao menos 2 mesas para formar uma combinação." }, { status: 400 });
    }
    const uniqueIds = Array.from(new Set(tableIds as string[]));
    const tables = await prisma.reservationTable.findMany({
      where: { id: { in: uniqueIds }, environment: { empresaId: empresa.id } },
      select: { id: true, environmentId: true },
    });
    if (tables.length !== uniqueIds.length) {
      return NextResponse.json({ error: "Uma ou mais mesas não foram encontradas." }, { status: 404 });
    }
    if (new Set(tables.map((t) => t.environmentId)).size > 1) {
      return NextResponse.json({ error: "Todas as mesas de uma combinação precisam ser do mesmo ambiente." }, { status: 400 });
    }
    await prisma.$transaction([
      prisma.reservationTableCombinationMember.deleteMany({ where: { combinationId: id } }),
      prisma.reservationTableCombinationMember.createMany({ data: uniqueIds.map((tableId) => ({ combinationId: id, tableId })) }),
    ]);
  }

  const data: { name?: string | null; active?: boolean } = {};
  if (body.name !== undefined) data.name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 100) : null;
  if (body.active !== undefined) data.active = !!body.active;
  if (Object.keys(data).length > 0) {
    await prisma.reservationTableCombination.update({ where: { id }, data });
  }

  const combination = await prisma.reservationTableCombination.findUnique({
    where: { id },
    include: { members: { include: { table: { select: { id: true, identificacao: true, environmentId: true, capacityMin: true, capacityMax: true } } } } },
  });
  return NextResponse.json({
    combination: { id: combination!.id, name: combination!.name, active: combination!.active, tables: combination!.members.map((m) => m.table) },
  });
}

/** Exclui uma combinação (só o cadastro — nunca apaga as mesas em si, nem reservas já feitas que
 * tenham usado essas mesas: `ReservationTableAssignment` não depende de
 * `ReservationTableCombination`, ver comentário de modelagem no schema). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!RESERVAS_MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode excluir combinações de mesas de Reservas." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "reservas", "canDelete"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite excluir combinações de mesas de Reservas." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para excluir uma combinação de mesas." }, { status: 400 });
  }

  const { id } = await params;
  const existing = await loadOwnedCombination(id, empresa.id);
  if (!existing) return NextResponse.json({ error: "Combinação não encontrada." }, { status: 404 });

  await prisma.reservationTableCombination.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
