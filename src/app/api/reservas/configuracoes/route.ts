import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { RESERVAS_MANAGER_ROLES, RESERVATION_WEEKDAYS, isValidHHMM, isIntInRange } from "@/lib/reservas";
import { storedDayKey } from "@/lib/timezone";

/**
 * Configuração de funcionamento de Reservas (Etapa 1) — dias/horários da semana + bloqueios de
 * data excepcionais (feriados). 1 loja por vez, mesmo padrão de `requireActiveSingleEmpresa()`
 * já usado em Produção/Financeiro: Reservas é uma configuração por `Empresa`, não por Grupo Nord.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "reservas", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver Reservas." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para ver as configurações." }, { status: 400 });
  }

  const settings = await prisma.reservationSettings.upsert({
    where: { empresaId: empresa.id },
    update: {},
    create: { empresaId: empresa.id },
  });

  // Garante as 7 linhas (uma por dia da semana) na primeira vez que a loja abre esta tela —
  // terça-feira já nasce fechada (open: false), os demais dias abertos 18:00-23:00. Ajustável
  // depois pelo PUT abaixo. `upsert` com `update: {}`: nunca sobrescreve um horário já
  // configurado por quem já passou por aqui antes.
  await Promise.all(
    RESERVATION_WEEKDAYS.map((dayOfWeek) =>
      prisma.reservationWeekdayHours.upsert({
        where: { settingsId_dayOfWeek: { settingsId: settings.id, dayOfWeek } },
        update: {},
        create: { settingsId: settings.id, dayOfWeek, open: dayOfWeek !== 2 },
      })
    )
  );

  const [weekdayHours, blockedDates] = await Promise.all([
    prisma.reservationWeekdayHours.findMany({ where: { settingsId: settings.id }, orderBy: { dayOfWeek: "asc" } }),
    prisma.reservationBlockedDate.findMany({
      where: { empresaId: empresa.id },
      orderBy: { date: "asc" },
      include: { createdBy: { select: { name: true } } },
    }),
  ]);

  return NextResponse.json({
    weekdayHours,
    blockedDates: blockedDates.map((b) => ({
      id: b.id,
      date: storedDayKey(b.date),
      reason: b.reason,
      createdByName: b.createdBy?.name ?? null,
      createdAt: b.createdAt.toISOString(),
    })),
    // Tarefa #192: 4 parâmetros que já existiam em `ReservationSettings` (schema) e já eram lidos
    // de fato pelo motor de disponibilidade (`src/lib/reservas-disponibilidade.ts`), mas nunca
    // tinham sido devolvidos por este GET nem editados por nenhuma tela — toda loja ficava travada
    // nos valores padrão do banco. Os outros campos de `ReservationSettings`
    // (`durationMinutes`/`cleaningMinutes`/`lateToleranceMinutes`) continuam fora desta tela por
    // não terem papel ativo no motor hoje (ver JSDoc de `ReservationSettingsValues`).
    settings: {
      minAdvanceMinutes: settings.minAdvanceMinutes,
      maxAdvanceDays: settings.maxAdvanceDays,
      specialGroupThreshold: settings.specialGroupThreshold,
      slotIntervalMinutes: settings.slotIntervalMinutes,
    },
  });
}

export async function PUT(req: Request) {
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

  // `weekdayHours` e os 4 campos avançados (tarefa #192) são salvos de forma independente — a
  // tela tem uma seção/botão "Salvar" para cada grupo, então cada PUT só manda o que o usuário
  // realmente editou naquele momento. `weekdayHoursProvided`/`advancedProvided` decidem o que foi
  // de fato pedido nesta chamada; pelo menos um dos dois precisa estar presente.
  const weekdayHoursProvided = Array.isArray(body?.weekdayHours);
  const weekdayHours: { dayOfWeek: unknown; open: unknown; openTime: unknown; closeTime: unknown }[] = weekdayHoursProvided
    ? body.weekdayHours
    : [];

  const ADVANCED_FIELDS = ["minAdvanceMinutes", "maxAdvanceDays", "specialGroupThreshold", "slotIntervalMinutes"] as const;
  const advancedProvided = ADVANCED_FIELDS.some((key) => body?.[key] !== undefined);

  if (!weekdayHoursProvided && !advancedProvided) {
    return NextResponse.json({ error: "Nenhuma alteração para salvar." }, { status: 400 });
  }

  if (weekdayHoursProvided && weekdayHours.length === 0) {
    return NextResponse.json({ error: "Informe os horários de ao menos um dia da semana." }, { status: 400 });
  }

  let advancedData: {
    minAdvanceMinutes: number;
    maxAdvanceDays: number;
    specialGroupThreshold: number;
    slotIntervalMinutes: number;
  } | null = null;
  if (advancedProvided) {
    const faltando = ADVANCED_FIELDS.filter((key) => body?.[key] === undefined);
    if (faltando.length > 0) {
      return NextResponse.json(
        { error: "Informe os 4 campos de configurações avançadas juntos (antecedência mínima, prazo máximo, grupo especial e intervalo entre horários)." },
        { status: 400 }
      );
    }
    if (!isIntInRange(body.minAdvanceMinutes, 0, 1440)) {
      return NextResponse.json(
        { error: "Antecedência mínima precisa ser um número inteiro entre 0 e 1440 minutos (24 horas)." },
        { status: 400 }
      );
    }
    if (!isIntInRange(body.maxAdvanceDays, 1, 365)) {
      return NextResponse.json(
        { error: "Prazo máximo de antecedência precisa ser um número inteiro entre 1 e 365 dias." },
        { status: 400 }
      );
    }
    if (!isIntInRange(body.specialGroupThreshold, 1, 100)) {
      return NextResponse.json(
        { error: "Tamanho de grupo especial precisa ser um número inteiro entre 1 e 100 pessoas." },
        { status: 400 }
      );
    }
    if (!isIntInRange(body.slotIntervalMinutes, 5, 240)) {
      return NextResponse.json(
        { error: "Intervalo entre horários precisa ser um número inteiro entre 5 e 240 minutos." },
        { status: 400 }
      );
    }
    advancedData = {
      minAdvanceMinutes: body.minAdvanceMinutes,
      maxAdvanceDays: body.maxAdvanceDays,
      specialGroupThreshold: body.specialGroupThreshold,
      slotIntervalMinutes: body.slotIntervalMinutes,
    };
  }

  for (const w of weekdayHours) {
    if (!RESERVATION_WEEKDAYS.includes(Number(w.dayOfWeek))) {
      return NextResponse.json({ error: "Dia da semana inválido." }, { status: 400 });
    }
    if (w.open && (!isValidHHMM(w.openTime) || !isValidHHMM(w.closeTime))) {
      return NextResponse.json(
        { error: "Informe horários de abertura e fechamento válidos (HH:mm) para os dias abertos." },
        { status: 400 }
      );
    }
    // Comparação lexicográfica de "HH:mm" (largura fixa, zero-padded) equivale à comparação
    // numérica de minutos do dia — não precisa converter. Não suportamos configuração cruzando a
    // meia-noite (ver nota em `generateSlotStarts`, src/lib/reservas-disponibilidade.ts): sem esta
    // checagem, um `closeTime <= openTime` era aceito aqui e só se manifestava como um dia "aberto"
    // sem nenhum horário disponível (array vazio do motor de disponibilidade), sem nenhum aviso.
    if (w.open && isValidHHMM(w.openTime) && isValidHHMM(w.closeTime) && w.closeTime <= w.openTime) {
      return NextResponse.json(
        {
          error:
            "Horário de fechamento precisa ser depois do de abertura no mesmo dia — configuração cruzando a meia-noite ainda não é suportada.",
        },
        { status: 400 }
      );
    }
  }

  const settings = await prisma.reservationSettings.upsert({
    where: { empresaId: empresa.id },
    update: advancedData ?? {},
    create: { empresaId: empresa.id, ...(advancedData ?? {}) },
  });

  // Só roda a transação de horários se `weekdayHours` foi de fato enviado nesta chamada —
  // `advancedProvided`-only (seção "Configurações avançadas" da tela) não deve tocar nas 7 linhas
  // de `ReservationWeekdayHours`, que já foram salvas (ou não) por uma chamada PUT separada.
  if (weekdayHoursProvided) {
    await prisma.$transaction(
      weekdayHours.map((w) =>
        prisma.reservationWeekdayHours.upsert({
          where: { settingsId_dayOfWeek: { settingsId: settings.id, dayOfWeek: Number(w.dayOfWeek) } },
          update: {
            open: !!w.open,
            openTime: isValidHHMM(w.openTime) ? w.openTime : undefined,
            closeTime: isValidHHMM(w.closeTime) ? w.closeTime : undefined,
          },
          create: {
            settingsId: settings.id,
            dayOfWeek: Number(w.dayOfWeek),
            open: !!w.open,
            openTime: isValidHHMM(w.openTime) ? w.openTime : undefined,
            closeTime: isValidHHMM(w.closeTime) ? w.closeTime : undefined,
          },
        })
      )
    );
  }

  return NextResponse.json({ ok: true });
}
