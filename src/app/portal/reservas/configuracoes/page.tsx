import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { RESERVAS_MANAGER_ROLES, RESERVATION_WEEKDAYS } from "@/lib/reservas";
import { storedDayKey } from "@/lib/timezone";
import { ConfiguracoesClient } from "./configuracoes-client";

export default async function ReservasConfiguracoesPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "reservas", "canView"))) {
    redirect("/portal/inicio");
  }

  // Trava dupla de cargo (igual à tela "Reservas", reservas/page.tsx): só os cargos de
  // `RESERVAS_MANAGER_ROLES` administram o módulo por padrão, mesmo que `hasModulePermission`
  // devolva `true` por algum `UserPermission` manual — ver comentário em `RESERVAS_MANAGER_ROLES`
  // (src/lib/reservas.ts) sobre essa trava ser intencional e não redundante.
  const isManagerRole = RESERVAS_MANAGER_ROLES.includes(session.user.role);
  const canManage = isManagerRole && (await hasModulePermission(session.user.id, "reservas", "canEdit"));
  const empresa = await requireActiveSingleEmpresa();

  let weekdayHours: { dayOfWeek: number; open: boolean; openTime: string; closeTime: string }[] = [];
  let blockedDates: { id: string; date: string; reason: string | null; createdByName: string | null }[] = [];
  // Tarefa #192: 4 parâmetros avançados que já existiam em `ReservationSettings` (schema) e já
  // eram lidos pelo motor de disponibilidade, mas nunca tinham sido expostos nesta tela — valores
  // default do schema até a loja abrir esta página e salvar (ver `DEFAULT_RESERVATION_SETTINGS`,
  // src/lib/reservas-disponibilidade.ts, para os mesmos defaults usados como fallback lá).
  let advancedSettings = { minAdvanceMinutes: 60, maxAdvanceDays: 60, specialGroupThreshold: 10, slotIntervalMinutes: 30 };

  if (empresa) {
    const settings = await prisma.reservationSettings.upsert({
      where: { empresaId: empresa.id },
      update: {},
      create: { empresaId: empresa.id },
    });

    await Promise.all(
      RESERVATION_WEEKDAYS.map((dayOfWeek) =>
        prisma.reservationWeekdayHours.upsert({
          where: { settingsId_dayOfWeek: { settingsId: settings.id, dayOfWeek } },
          update: {},
          create: { settingsId: settings.id, dayOfWeek, open: dayOfWeek !== 2 },
        })
      )
    );

    const [hours, blocked] = await Promise.all([
      prisma.reservationWeekdayHours.findMany({ where: { settingsId: settings.id }, orderBy: { dayOfWeek: "asc" } }),
      prisma.reservationBlockedDate.findMany({
        where: { empresaId: empresa.id },
        orderBy: { date: "asc" },
        include: { createdBy: { select: { name: true } } },
      }),
    ]);

    weekdayHours = hours.map((h) => ({ dayOfWeek: h.dayOfWeek, open: h.open, openTime: h.openTime, closeTime: h.closeTime }));
    blockedDates = blocked.map((b) => ({
      id: b.id,
      date: storedDayKey(b.date),
      reason: b.reason,
      createdByName: b.createdBy?.name ?? null,
    }));
    advancedSettings = {
      minAdvanceMinutes: settings.minAdvanceMinutes,
      maxAdvanceDays: settings.maxAdvanceDays,
      specialGroupThreshold: settings.specialGroupThreshold,
      slotIntervalMinutes: settings.slotIntervalMinutes,
    };
  }

  return (
    <PageContainer title="Reservas" subtitle="Configurações" backHref="/portal/reservas" backLabel="Reservas">
      <ConfiguracoesClient
        weekdayHours={weekdayHours}
        blockedDates={blockedDates}
        advancedSettings={advancedSettings}
        canManage={canManage && !!empresa}
        hasEmpresa={!!empresa}
        empresaKey={empresa?.key ?? null}
      />
    </PageContainer>
  );
}
