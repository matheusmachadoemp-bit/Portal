import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { RESERVAS_MANAGER_ROLES, isPositiveInt } from "@/lib/reservas";

/** Ambientes (Etapa 2 — Mesas e Ambientes). Sem mapa visual: só CRUD de lista/formulário (ver
 * prompt da tarefa "reservas-etapa2"). */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "reservas", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver Reservas." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para ver os ambientes." }, { status: 400 });
  }

  const environments = await prisma.reservationEnvironment.findMany({
    where: { empresaId: empresa.id },
    orderBy: { order: "asc" },
    include: { _count: { select: { tables: true } } },
  });

  return NextResponse.json({
    environments: environments.map((e) => ({
      id: e.id,
      name: e.name,
      capacity: e.capacity,
      active: e.active,
      order: e.order,
      tableCount: e._count.tables,
    })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!RESERVAS_MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode criar ambientes de Reservas." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "reservas", "canCreate"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite criar ambientes de Reservas." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para criar um ambiente." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Informe o nome do ambiente." }, { status: 400 });
  if (!isPositiveInt(body?.capacity)) {
    return NextResponse.json({ error: "Informe uma capacidade válida (inteiro maior que zero)." }, { status: 400 });
  }

  const last = await prisma.reservationEnvironment.findFirst({
    where: { empresaId: empresa.id },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  try {
    const environment = await prisma.reservationEnvironment.create({
      data: { empresaId: empresa.id, name, capacity: body.capacity, order: (last?.order ?? -1) + 1 },
    });
    return NextResponse.json({ environment });
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Já existe um ambiente com esse nome." }, { status: 409 });
    }
    throw err;
  }
}
