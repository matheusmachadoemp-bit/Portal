import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { RESERVAS_MANAGER_ROLES } from "@/lib/reservas";
import { parseDayInput, storedDayKey } from "@/lib/timezone";

/** Bloqueios de data excepcionais (feriados etc.) de Reservas — ver GET/PUT em
 * `src/app/api/reservas/configuracoes/route.ts` para o restante da configuração (horário por
 * dia da semana). Rota irmã separada porque é uma lista (criar/remover item a item), diferente
 * do PUT de horários (substitui o conjunto inteiro de uma vez). */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!RESERVAS_MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode alterar as configurações de Reservas." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "reservas", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite alterar as configurações de Reservas." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para alterar as configurações." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const date = parseDayInput(body?.date);
  if (!date) {
    return NextResponse.json({ error: "Informe uma data válida (AAAA-MM-DD)." }, { status: 400 });
  }
  const reason = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 200) : null;

  try {
    const blocked = await prisma.reservationBlockedDate.create({
      data: { empresaId: empresa.id, date, reason, createdById: session.user.id },
      include: { createdBy: { select: { name: true } } },
    });
    return NextResponse.json({
      blocked: {
        id: blocked.id,
        date: storedDayKey(blocked.date),
        reason: blocked.reason,
        createdByName: blocked.createdBy?.name ?? null,
        createdAt: blocked.createdAt.toISOString(),
      },
    });
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Essa data já está bloqueada." }, { status: 409 });
    }
    throw err;
  }
}
