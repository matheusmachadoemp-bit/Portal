import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { RESERVAS_MANAGER_ROLES } from "@/lib/reservas";

/** Combinações de mesas pré-cadastradas (Etapa 2 — ver comentário de modelagem no
 * `prisma/schema.prisma` acima de `model ReservationEnvironment`, ponto 3): cadastro de "estas
 * mesas, juntas, atendem um grupo maior" — o motor de disponibilidade
 * (src/lib/reservas-disponibilidade.ts) sugere isso como opção quando todas as mesas da
 * combinação estão livres no horário pedido. */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "reservas", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver Reservas." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para ver as combinações de mesas." }, { status: 400 });
  }

  const combinations = await prisma.reservationTableCombination.findMany({
    where: { empresaId: empresa.id },
    orderBy: { createdAt: "asc" },
    include: { members: { include: { table: { select: { id: true, identificacao: true, environmentId: true, capacityMin: true, capacityMax: true } } } } },
  });

  return NextResponse.json({
    combinations: combinations.map((c) => ({
      id: c.id,
      name: c.name,
      active: c.active,
      tables: c.members.map((m) => m.table),
    })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!RESERVAS_MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode criar combinações de mesas de Reservas." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "reservas", "canCreate"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite criar combinações de mesas de Reservas." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para criar uma combinação de mesas." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const tableIds: unknown = body?.tableIds;
  if (!Array.isArray(tableIds) || tableIds.length < 2 || !tableIds.every((t) => typeof t === "string")) {
    return NextResponse.json({ error: "Selecione ao menos 2 mesas para formar uma combinação." }, { status: 400 });
  }
  const uniqueIds = Array.from(new Set(tableIds as string[]));
  if (uniqueIds.length !== tableIds.length) {
    return NextResponse.json({ error: "Mesas repetidas na combinação." }, { status: 400 });
  }
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim().slice(0, 100) : null;

  const tables = await prisma.reservationTable.findMany({
    where: { id: { in: uniqueIds }, environment: { empresaId: empresa.id } },
    select: { id: true, environmentId: true },
  });
  if (tables.length !== uniqueIds.length) {
    return NextResponse.json({ error: "Uma ou mais mesas não foram encontradas." }, { status: 404 });
  }
  const environmentIds = new Set(tables.map((t) => t.environmentId));
  if (environmentIds.size > 1) {
    return NextResponse.json({ error: "Todas as mesas de uma combinação precisam ser do mesmo ambiente." }, { status: 400 });
  }

  const combination = await prisma.reservationTableCombination.create({
    data: {
      empresaId: empresa.id,
      name,
      members: { create: uniqueIds.map((tableId) => ({ tableId })) },
    },
    include: { members: { include: { table: { select: { id: true, identificacao: true, environmentId: true, capacityMin: true, capacityMax: true } } } } },
  });

  return NextResponse.json({
    combination: { id: combination.id, name: combination.name, active: combination.active, tables: combination.members.map((m) => m.table) },
  });
}
