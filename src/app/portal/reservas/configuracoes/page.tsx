import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageContainer } from "@/components/page-container";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import { RESERVATION_WEEKDAYS } from "@/lib/reservas";
import { storedDayKey } from "@/lib/timezone";
import { ConfiguracoesClient } from "./configuracoes-client";

export default async function ReservasConfiguracoesPage() {
  const session = await auth();
  if (!session?.user || !(await hasModulePermission(session.user.id, "reservas", "canView"))) {
    redirect("/portal/inicio");
  }

  const canManage = await hasModulePermission(session.user.id, "reservas", "canEdit");
  const empresa = await requireActiveSingleEmpresa();

  let weekdayHours: { dayOfWeek: number; open: boolean; openTime: string; closeTime: string }[] = [];
  let blockedDates: { id: string; date: string; reason: string | null; createdByName: string | null }[] = [];

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
  }

  return (
    <PageContainer title="Reservas" subtitle="Configurações" backHref="/portal/reservas" backLabel="Reservas">
      <ConfiguracoesClient
        weekdayHours={weekdayHours}
        blockedDates={blockedDates}
        canManage={canManage && !!empresa}
        hasEmpresa={!!empresa}
      />
    </PageContainer>
  );
}
