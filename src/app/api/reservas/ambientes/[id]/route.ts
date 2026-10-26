import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { RESERVAS_MANAGER_ROLES, isPositiveInt } from "@/lib/reservas";

/** Editar nome/capacidade/ativo/ordem de um ambiente (ver GET/POST em
 * `src/app/api/reservas/ambientes/route.ts`). Sem DELETE de propósito — ambiente vira inativo em
 * vez de apagado, mesmo padrão já usado em `CustomerSurveyQuestion` (perguntas de Satisfação do
 * Cliente): nunca existe exclusão de verdade de um cadastro que pode já ter histórico associado
 * (mesas, e futuramente reservas). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!RESERVAS_MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode alterar ambientes de Reservas." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "reservas", "canEdit"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite alterar ambientes de Reservas." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para alterar um ambiente." }, { status: 400 });
  }

  const { id } = await params;
  const existing = await prisma.reservationEnvironment.findUnique({ where: { id } });
  if (!existing || existing.empresaId !== empresa.id) {
    return NextResponse.json({ error: "Ambiente não encontrado." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });

  const data: Prisma.ReservationEnvironmentUpdateInput = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "Informe o nome do ambiente." }, { status: 400 });
    data.name = name;
  }
  if (body.capacity !== undefined) {
    if (!isPositiveInt(body.capacity)) {
      return NextResponse.json({ error: "Informe uma capacidade válida (inteiro maior que zero)." }, { status: 400 });
    }
    data.capacity = body.capacity;
  }
  if (body.active !== undefined) data.active = !!body.active;
  if (body.order !== undefined) {
    if (!Number.isFinite(body.order)) return NextResponse.json({ error: "Ordem inválida." }, { status: 400 });
    data.order = Math.round(body.order);
  }

  try {
    const environment = await prisma.reservationEnvironment.update({ where: { id }, data });
    return NextResponse.json({ environment });
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Já existe um ambiente com esse nome." }, { status: 409 });
    }
    throw err;
  }
}
