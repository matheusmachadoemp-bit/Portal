import { NextResponse } from "next/server";
import type { ReservationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { parseDateKey, spDateKey, spStartOfDay } from "@/lib/timezone";
import { RESERVATION_STATUSES } from "@/lib/reservas";

const STATUSES = RESERVATION_STATUSES as ReservationStatus[];

const RESERVATION_LIST_INCLUDE = {
  empresa: { select: { id: true, name: true, color: true } },
  environment: { select: { id: true, name: true } },
  cliente: { select: { id: true, nome: true } },
  tables: { select: { table: { select: { id: true, identificacao: true } } } },
};

/**
 * Lista de reservas (Etapa 4 — telas "Reservas"/"Visão Geral"/"Calendário") — `GET` só, a
 * criação de reserva continua exclusiva do fluxo público (`POST
 * /api/reservar/[empresaKey]/reservas`, ver `src/lib/reservas-disponibilidade.ts`); esta rota
 * nunca cria nada, só consulta o que já existe para a loja (ou lojas, em modo Grupo Nord) ativa.
 *
 * Filtros (todos via querystring, todos opcionais):
 * - `date`: um único dia ("YYYY-MM-DD"). Tem prioridade sobre `dateFrom`/`dateTo` se os três
 *   vierem juntos.
 * - `dateFrom`/`dateTo`: intervalo de dias (qualquer um dos dois pode vir solto, abrindo o
 *   intervalo só de um lado) — usado pelo Calendário (mês inteiro) e por filtros de período da
 *   tela "Reservas".
 * - Sem nenhum dos três: assume HOJE (mesmo padrão de "Visão Geral", que sempre quer o dia
 *   atual) — nunca lista o histórico inteiro sem filtro nenhum.
 * - `status`: um ou mais valores do enum `ReservationStatus`, separados por vírgula.
 * - `environmentId`: uma reserva de um ambiente específico.
 * - `q`: busca livre (nome do cliente, telefone ou código de confirmação), case-insensitive.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "reservas", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver Reservas." }, { status: 403 });
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const dateFromParam = searchParams.get("dateFrom");
  const dateToParam = searchParams.get("dateTo");
  const statusParam = searchParams.get("status");
  const environmentId = searchParams.get("environmentId");
  const q = searchParams.get("q")?.trim();

  let dateFromKey: string | null = null;
  let dateToKey: string | null = null;
  if (dateParam) {
    const key = parseDateKey(dateParam);
    if (!key) return NextResponse.json({ error: "Data inválida." }, { status: 400 });
    dateFromKey = key;
    dateToKey = key;
  } else if (dateFromParam || dateToParam) {
    if (dateFromParam) {
      dateFromKey = parseDateKey(dateFromParam);
      if (!dateFromKey) return NextResponse.json({ error: "Data inicial inválida." }, { status: 400 });
    }
    if (dateToParam) {
      dateToKey = parseDateKey(dateToParam);
      if (!dateToKey) return NextResponse.json({ error: "Data final inválida." }, { status: 400 });
    }
  } else {
    const today = spDateKey();
    dateFromKey = today;
    dateToKey = today;
  }

  const and: Record<string, unknown>[] = [{ empresaId: { in: empresaIds } }];
  if (dateFromKey) and.push({ date: { gte: spStartOfDay(dateFromKey) } });
  if (dateToKey) and.push({ date: { lte: spStartOfDay(dateToKey) } });
  if (environmentId) and.push({ environmentId });
  if (statusParam) {
    const requested = statusParam.split(",").map((s) => s.trim()).filter(Boolean);
    const valid = requested.filter((s): s is ReservationStatus => STATUSES.includes(s as ReservationStatus));
    if (valid.length === 0) return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    and.push({ status: { in: valid } });
  }
  if (q) {
    and.push({
      OR: [
        { customerName: { contains: q, mode: "insensitive" } },
        { customerPhone: { contains: q, mode: "insensitive" } },
        { confirmationCode: { contains: q, mode: "insensitive" } },
        { cliente: { nome: { contains: q, mode: "insensitive" } } },
      ],
    });
  }

  const reservations = await prisma.reservation.findMany({
    where: { AND: and },
    orderBy: { startTime: "asc" },
    include: RESERVATION_LIST_INCLUDE,
  });

  return NextResponse.json({
    reservations: reservations.map((r) => ({
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
      tables: r.tables.map((t) => t.table),
    })),
  });
}
