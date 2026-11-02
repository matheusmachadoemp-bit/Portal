import { NextResponse } from "next/server";
import { Prisma, ReservationWaitlistStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { RESERVAS_MANAGER_ROLES, RESERVATION_WAITLIST_ACTIVE_STATUSES, isPositiveInt, onlyDigits } from "@/lib/reservas";
import { serializeWaitlistEntry } from "@/lib/reservas-server";
import { spDateKey, spStartOfDay } from "@/lib/timezone";

const NAME_MAX_LENGTH = 120;
const NOTES_MAX_LENGTH = 500;

/** Fila de Espera (Etapa 4 — ver bloco de comentário no `prisma/schema.prisma` acima de `model
 * ReservationWaitlistEntry`, seção "REDESIGN"). Mesmo padrão de escopo/permissão do resto do
 * módulo Reservas (`src/app/api/reservas/ambientes/route.ts`): 1 loja por vez via
 * `requireActiveSingleEmpresa`, `hasModulePermission(..., "reservas", ...)` reaproveitando a
 * mesma chave de módulo.
 *
 * Sem filtro de data/status vindo de fora a partir do redesign (não existe mais `desiredDate`,
 * e a tela agrupa AGUARDANDO/CONTATADO — "na fila agora" — e o restante — "histórico" — no
 * próprio client, a partir da mesma lista). Pra não devolver um histórico infinito de entradas
 * resolvidas (CANCELADO/EXPIRADO/CONVERTIDO_EM_RESERVA) acumuladas ao longo de meses, a rota só
 * devolve: (a) entradas ainda "vivas" (AGUARDANDO/CONTATADO), de qualquer data — não deveriam
 * existir por mais de algumas horas, mas não corta por segurança; e (b) qualquer entrada criada
 * HOJE (America/Sao_Paulo), independente do status — cobre o histórico do dia mostrado na tela. */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "reservas", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver Reservas." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para ver a fila de espera." }, { status: 400 });
  }

  const startOfToday = spStartOfDay(spDateKey());
  const where: Prisma.ReservationWaitlistEntryWhereInput = {
    empresaId: empresa.id,
    OR: [
      { status: { in: RESERVATION_WAITLIST_ACTIVE_STATUSES as ReservationWaitlistStatus[] } },
      { createdAt: { gte: startOfToday } },
    ],
  };

  const entries = await prisma.reservationWaitlistEntry.findMany({
    where,
    orderBy: [{ createdAt: "asc" }],
  });

  return NextResponse.json({ entries: entries.map(serializeWaitlistEntry) });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!RESERVAS_MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode adicionar entradas na fila de espera." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "reservas", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite adicionar entradas na fila de espera." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para adicionar à fila de espera." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);

  const customerName = typeof body?.customerName === "string" ? body.customerName.trim() : "";
  if (!customerName) return NextResponse.json({ error: "Informe o nome do cliente." }, { status: 400 });
  if (customerName.length > NAME_MAX_LENGTH) return NextResponse.json({ error: "Nome muito longo." }, { status: 400 });

  const customerPhone = onlyDigits(typeof body?.customerPhone === "string" ? body.customerPhone : "");
  if (customerPhone.length < 10 || customerPhone.length > 11) {
    return NextResponse.json({ error: "Informe um telefone válido, com DDD." }, { status: 400 });
  }

  if (!isPositiveInt(body?.partySize)) {
    return NextResponse.json({ error: "Informe a quantidade de pessoas (inteiro maior que zero)." }, { status: 400 });
  }

  const notes =
    typeof body?.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, NOTES_MAX_LENGTH) : null;

  const entry = await prisma.reservationWaitlistEntry.create({
    data: {
      empresaId: empresa.id,
      customerName,
      customerPhone,
      partySize: body.partySize,
      notes,
    },
  });

  return NextResponse.json({ entry: serializeWaitlistEntry(entry) });
}
