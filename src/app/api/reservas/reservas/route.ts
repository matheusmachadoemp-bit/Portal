import { NextResponse } from "next/server";
import { Prisma, type ReservationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { parseDateKey, spDateKey, spStartOfDay } from "@/lib/timezone";
import {
  RESERVAS_MANAGER_ROLES,
  RESERVATION_STATUSES,
  RESERVATION_CUSTOMER_NAME_MAX_LENGTH,
  RESERVATION_CUSTOMER_EMAIL_MAX_LENGTH,
  isPositiveInt,
  isValidHHMM,
  isValidEmail,
  onlyDigits,
} from "@/lib/reservas";
import {
  ReservationBusyError,
  ReservationCodeExhaustedError,
  ReservationConflictError,
  getAvailability,
  reserveTablesTransacted,
} from "@/lib/reservas-disponibilidade";
import { pickBestOption } from "@/lib/reservas-publico";

const STATUSES = RESERVATION_STATUSES as ReservationStatus[];

const RESERVATION_LIST_INCLUDE = {
  empresa: { select: { id: true, name: true, color: true } },
  environment: { select: { id: true, name: true } },
  cliente: { select: { id: true, nome: true } },
  tables: { select: { table: { select: { id: true, identificacao: true } } } },
};

type ReservationWithRelations = Prisma.ReservationGetPayload<{ include: typeof RESERVATION_LIST_INCLUDE }>;

/** Serialização comum de uma reserva com as relações de `RESERVATION_LIST_INCLUDE` — usada tanto
 * pelo `GET` (lista) quanto pelo `POST` (criação manual, Etapa 4) abaixo, para a tela "Reservas"
 * receber exatamente o mesmo formato (`ReservationDTO`, ver `reservas-client.tsx`) nos dois casos
 * e poder inserir a reserva recém-criada na lista sem precisar recarregar tudo. */
function serializeReservation(r: ReservationWithRelations) {
  return {
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
  };
}

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
    reservations: reservations.map(serializeReservation),
  });
}

/**
 * Cria uma reserva MANUALMENTE (Etapa 4 — tela "Reservas", botão "Nova reserva"; ver prompt da
 * tarefa "reservas-criar-manual-calendario"). Cobre o caso de um funcionário atendendo um cliente
 * por telefone/balcão — diferente do fluxo público (`POST /api/reservar/[empresaKey]/reservas`),
 * que não tem sessão e não exige cargo/permissão nenhuma.
 *
 * Reaproveita o MESMO motor de disponibilidade do fluxo público (`getAvailability` +
 * `pickBestOption` + `reserveTablesTransacted`) — nenhuma lógica de achar mesa livre/evitar
 * conflito duplicada aqui; a única diferença de verdade é o status inicial: `CONFIRMADA` em vez
 * de `PENDENTE` (ver comentário em `reserveTablesTransacted`, `src/lib/reservas-disponibilidade.
 * ts`) — decisão: quando é a própria loja que atende e cadastra, não existe o mesmo "aguardando
 * confirmação" do cliente pedindo pelo site; a reserva já nasce confirmada pelo atendente.
 *
 * Mesmo padrão de dupla trava (cargo + permissão de módulo) das demais rotas de ESCRITA de
 * Reservas (`POST /api/reservas/mesas`, `/ambientes`, `/combinacoes`) — `canCreate`, não
 * `canEdit` (criar é uma ação de criação, igual as outras). Só em loja única (nunca em modo Grupo
 * Nord), igual as demais escritas do módulo.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!RESERVAS_MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode criar reservas manualmente." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "reservas", "canCreate"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite criar reservas." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para criar uma reserva." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);

  const environmentId = typeof body?.environmentId === "string" && body.environmentId ? body.environmentId : null;
  if (!environmentId) {
    return NextResponse.json({ error: "Informe o ambiente." }, { status: 400 });
  }

  const dateKey = parseDateKey(body?.date);
  if (!dateKey) {
    return NextResponse.json({ error: "Informe uma data válida." }, { status: 400 });
  }

  if (!isValidHHMM(body?.time)) {
    return NextResponse.json({ error: "Informe um horário válido." }, { status: 400 });
  }
  const horario: string = body.time;

  const partySize = Number(body?.partySize);
  if (!isPositiveInt(partySize)) {
    return NextResponse.json({ error: "Informe a quantidade de pessoas (inteiro maior que zero)." }, { status: 400 });
  }

  const customerName = typeof body?.customerName === "string" ? body.customerName.trim() : "";
  if (!customerName) return NextResponse.json({ error: "Informe o nome do cliente." }, { status: 400 });
  if (customerName.length > RESERVATION_CUSTOMER_NAME_MAX_LENGTH) {
    return NextResponse.json({ error: "Nome muito longo." }, { status: 400 });
  }

  const customerPhone = onlyDigits(typeof body?.customerPhone === "string" ? body.customerPhone : "");
  if (customerPhone.length < 10 || customerPhone.length > 11) {
    return NextResponse.json({ error: "Informe um telefone válido, com DDD." }, { status: 400 });
  }

  const customerEmailRaw = typeof body?.customerEmail === "string" ? body.customerEmail.trim() : "";
  if (customerEmailRaw && (customerEmailRaw.length > RESERVATION_CUSTOMER_EMAIL_MAX_LENGTH || !isValidEmail(customerEmailRaw))) {
    return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });
  }

  try {
    // Mesma validação do fluxo público: confere disponibilidade de verdade no momento da
    // criação (o formulário pode ter ficado aberto um tempo, ou o funcionário pode ter escolhido
    // um horário sem recarregar a grade) — nenhuma lógica de disponibilidade duplicada aqui.
    const availability = await getAvailability({ empresaId: empresa.id, environmentId, dateKey, partySize, time: horario });
    if (!availability.open) {
      return NextResponse.json({ error: "Esse dia não está disponível para reservas. Escolha outra data." }, { status: 409 });
    }
    const slot = availability.slots.find((s) => s.time === horario);
    if (!slot || !slot.available) {
      return NextResponse.json({ error: "Esse horário não está disponível. Escolha outro horário." }, { status: 409 });
    }
    const option = pickBestOption(slot.options, partySize);
    if (!option) {
      return NextResponse.json({ error: "Esse horário não está disponível. Escolha outro horário." }, { status: 409 });
    }

    const existingCliente = await prisma.cliente.findFirst({
      where: { empresaId: empresa.id, telefone: customerPhone },
      select: { id: true },
    });

    const created = await reserveTablesTransacted({
      empresaId: empresa.id,
      environmentId,
      tableIds: option.tableIds,
      dateKey,
      startTime: new Date(slot.startTime),
      endTime: new Date(slot.endTime),
      partySize,
      clienteId: existingCliente?.id ?? null,
      cleaningMinutes: availability.settings.cleaningMinutes,
      customerName,
      customerPhone,
      customerEmail: customerEmailRaw || null,
      status: "CONFIRMADA",
    });

    const reservation = await prisma.reservation.findUnique({
      where: { id: created.id },
      include: RESERVATION_LIST_INCLUDE,
    });

    return NextResponse.json({ reservation: reservation ? serializeReservation(reservation) : null });
  } catch (err) {
    if (err instanceof ReservationBusyError || err instanceof ReservationConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof ReservationCodeExhaustedError) {
      console.error("[POST /api/reservas/reservas] código de confirmação esgotado:", err);
      return NextResponse.json(
        { error: "Não foi possível gerar um código de confirmação agora, tente novamente em alguns instantes." },
        { status: 503 },
      );
    }
    // Rota autenticada (não pública), mas mesmo cuidado do fluxo público: nunca vazar
    // detalhe/stack interno de um erro inesperado (ex.: falha transitória de conexão) pro
    // cliente — fica logado no servidor para investigação.
    console.error("[POST /api/reservas/reservas] erro inesperado:", err);
    return NextResponse.json({ error: "Não foi possível criar a reserva, tente novamente." }, { status: 500 });
  }
}
