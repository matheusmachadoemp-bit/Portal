import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { RESERVAS_MANAGER_ROLES, RESERVATION_WEEKDAYS, isValidHHMM } from "@/lib/reservas";
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
  const weekdayHours: { dayOfWeek: unknown; open: unknown; openTime: unknown; closeTime: unknown }[] = Array.isArray(
    body?.weekdayHours
  )
    ? body.weekdayHours
    : [];
  if (weekdayHours.length === 0) {
    return NextResponse.json({ error: "Informe os horários de ao menos um dia da semana." }, { status: 400 });
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
  }

  const settings = await prisma.reservationSettings.upsert({
    where: { empresaId: empresa.id },
    update: {},
    create: { empresaId: empresa.id },
  });

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

  return NextResponse.json({ ok: true });
}
