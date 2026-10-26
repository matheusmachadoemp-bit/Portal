import { NextResponse } from "next/server";
import { Prisma, ReservationTableStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { RESERVAS_MANAGER_ROLES, RESERVATION_TABLE_STATUSES, isPositiveInt } from "@/lib/reservas";

const STATUSES = RESERVATION_TABLE_STATUSES as ReservationTableStatus[];

/** Mesas (Etapa 2 — Mesas e Ambientes). `GET` lista todas as mesas da loja (todas, não só as
 * "reserváveis" — isso é um filtro do motor de disponibilidade, não desta tela de cadastro),
 * agrupáveis por ambiente no cliente. `POST` cria uma mesa vinculada a um ambiente já
 * cadastrado. */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "reservas", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver Reservas." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para ver as mesas." }, { status: 400 });
  }

  const tables = await prisma.reservationTable.findMany({
    where: { environment: { empresaId: empresa.id } },
    orderBy: [{ environmentId: "asc" }, { order: "asc" }],
  });

  return NextResponse.json({ tables });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!RESERVAS_MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode criar mesas de Reservas." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "reservas", "canCreate"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite criar mesas de Reservas." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para criar uma mesa." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const identificacao = typeof body?.identificacao === "string" ? body.identificacao.trim() : "";
  if (!identificacao) return NextResponse.json({ error: "Informe a identificação da mesa (ex.: Mesa 01)." }, { status: 400 });
  if (typeof body?.environmentId !== "string" || !body.environmentId) {
    return NextResponse.json({ error: "Informe o ambiente da mesa." }, { status: 400 });
  }
  if (!isPositiveInt(body?.capacityMin) || !isPositiveInt(body?.capacityMax)) {
    return NextResponse.json({ error: "Informe capacidade mínima e máxima válidas (inteiros maiores que zero)." }, { status: 400 });
  }
  if (body.capacityMin > body.capacityMax) {
    return NextResponse.json({ error: "A capacidade mínima não pode ser maior que a máxima." }, { status: 400 });
  }
  const status: ReservationTableStatus = STATUSES.includes(body?.status) ? body.status : "DISPONIVEL";
  const availableForReservation = body?.availableForReservation === undefined ? true : !!body.availableForReservation;

  const environment = await prisma.reservationEnvironment.findFirst({
    where: { id: body.environmentId, empresaId: empresa.id },
    select: { id: true },
  });
  if (!environment) return NextResponse.json({ error: "Ambiente não encontrado." }, { status: 404 });

  const last = await prisma.reservationTable.findFirst({
    where: { environmentId: environment.id },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  try {
    const table = await prisma.reservationTable.create({
      data: {
        environmentId: environment.id,
        identificacao,
        capacityMin: body.capacityMin,
        capacityMax: body.capacityMax,
        status,
        availableForReservation,
        order: (last?.order ?? -1) + 1,
      },
    });
    return NextResponse.json({ table });
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Já existe uma mesa com essa identificação neste ambiente." }, { status: 409 });
    }
    throw err;
  }
}
