import { prisma } from "@/lib/prisma";
import type { ChecklistEscalationType } from "@prisma/client";
import {
  CHECKLIST_ESCALATION_PRIORITY,
  computeOccurrenceStatus,
  dueEscalationLevels,
  spDateKey,
  spDateTime,
  spStartOfDay,
  weekdayFieldFor,
} from "@/lib/checklist";

/**
 * Gera (de forma idempotente, via @@unique([templateId, date])) as
 * ocorrências do dia `dateKey` para os templates ativos das empresas
 * informadas — só nos dias da semana marcados no template.
 */
export async function generateChecklistOccurrences(empresaIds: string[], dateKey: string = spDateKey()) {
  if (empresaIds.length === 0) return;

  const day = spStartOfDay(dateKey);
  const weekdayField = weekdayFieldFor(dateKey);

  const templates = await prisma.checklistTemplate.findMany({
    where: {
      empresaId: { in: empresaIds },
      active: true,
      startDate: { lte: day },
      OR: [{ endDate: null }, { endDate: { gte: day } }],
      [weekdayField]: true,
    },
  });

  for (const t of templates) {
    const releaseAt = spDateTime(dateKey, t.releaseTime);
    const dueAt = spDateTime(dateKey, t.dueTime);
    await prisma.checklistOccurrence.upsert({
      where: { templateId_date: { templateId: t.id, date: day } },
      update: {},
      create: {
        templateId: t.id,
        empresaId: t.empresaId,
        date: day,
        releaseAt,
        dueAt,
        responsavelId: t.responsavelId,
      },
    });
  }
}

/** Recalcula (e persiste, se mudou) o status "ao vivo" de cada ocorrência. */
export async function refreshOccurrenceStatuses(occurrenceIds: string[]) {
  if (occurrenceIds.length === 0) return;
  const occurrences = await prisma.checklistOccurrence.findMany({ where: { id: { in: occurrenceIds } } });
  const now = new Date();
  await Promise.all(
    occurrences.map((o) => {
      const next = computeOccurrenceStatus({
        releaseAt: o.releaseAt,
        dueAt: o.dueAt,
        startedAt: o.startedAt,
        completedAt: o.completedAt,
        currentStatus: o.status,
        now,
      });
      if (next === o.status) return null;
      return prisma.checklistOccurrence.update({ where: { id: o.id }, data: { status: next } });
    })
  );
}

const GOAL_CATEGORY_LABEL: Record<string, string> = {
  GERENCIA: "Gerência",
  SALAO: "Salão",
  COZINHA: "Cozinha",
  DELIVERY: "Delivery",
  MARKETING: "Marketing",
  ADMINISTRATIVO: "Administrativo",
};

/** Gerentes da loja (role GERENTE com acesso à loja) + proprietários/administradores (veem todas as lojas). */
async function loadEscalationManagers(empresaId: string) {
  return prisma.user.findMany({
    where: {
      active: true,
      OR: [
        { role: { in: ["ADMINISTRADOR", "GESTOR"] } },
        { role: "GERENTE", empresaAccess: { some: { empresaId } } },
      ],
    },
    select: { id: true },
  });
}

function escalationMessage(
  tipo: ChecklistEscalationType,
  ctx: { name: string; empresaName: string; setor: string; minutesLate: number; responsavelName: string | null }
) {
  const setorLabel = GOAL_CATEGORY_LABEL[ctx.setor] ?? ctx.setor;
  const local = `${ctx.empresaName}, ${setorLabel}`;
  const responsavel = ctx.responsavelName ? ` Responsável: ${ctx.responsavelName}.` : "";
  switch (tipo) {
    case "AVISO_ANTES":
      return { title: "Checklist perto do prazo", body: `"${ctx.name}" está perto do horário limite — ${local}.` };
    case "NO_LIMITE":
      return { title: "Checklist no horário limite", body: `"${ctx.name}" chegou ao horário limite — ${local}.` };
    case "ATRASO_RESPONSAVEL":
      return {
        title: "Checklist atrasado",
        body: `"${ctx.name}" está ${Math.max(0, Math.round(ctx.minutesLate))} min atrasado — ${local}.${responsavel}`,
      };
    case "ALERTA_CRITICO":
      return {
        title: "Atraso crítico em checklist",
        body: `"${ctx.name}" está ${Math.max(0, Math.round(ctx.minutesLate))} min atrasado (crítico) — ${local}.${responsavel}`,
      };
    case "NAO_REALIZADO":
      return {
        title: "Checklist não realizado",
        body: `"${ctx.name}" não foi concluído dentro do prazo e foi marcado como não realizado — ${local}.${responsavel}`,
      };
  }
}

/**
 * Processa cobrança automática das ocorrências informadas: para cada nível
 * de escalonamento já vencido (calculado a partir dos horários e das
 * configurações do template), notifica os destinatários certos — uma única
 * vez por ocorrência+nível+destinatário, graças à chave única de
 * `ChecklistEscalationLog`. Ao atingir o nível NAO_REALIZADO, também marca a
 * ocorrência como não realizada.
 */
export async function processChecklistEscalations(occurrenceIds: string[]) {
  if (occurrenceIds.length === 0) return { notified: 0 };

  const occurrences = await prisma.checklistOccurrence.findMany({
    where: { id: { in: occurrenceIds } },
    include: { template: true, empresa: { select: { name: true } }, responsavel: { select: { id: true, name: true } } },
  });

  const now = new Date();
  let notified = 0;

  for (const o of occurrences) {
    if (!o.template.cobrancaAtiva) continue;

    const levels = dueEscalationLevels({
      dueAt: o.dueAt,
      completedAt: o.completedAt,
      currentStatus: o.status,
      avisoAntesMinutos: o.template.avisoAntesMinutos,
      avisoAtrasoResponsavelMinutos: o.template.avisoAtrasoResponsavelMinutos,
      alertaCriticoMinutos: o.template.alertaCriticoMinutos,
      naoRealizadoMinutos: o.template.naoRealizadoMinutos,
      now,
    });
    if (levels.length === 0) continue;

    const minutesLate = (now.getTime() - o.dueAt.getTime()) / 60000;
    const managers = await loadEscalationManagers(o.empresaId);
    const managerIds = new Set(managers.map((m) => m.id));

    for (const tipo of levels) {
      let recipientIds: string[];
      if (tipo === "AVISO_ANTES" || tipo === "NO_LIMITE") {
        recipientIds = o.responsavelId ? [o.responsavelId] : [];
      } else if (tipo === "ATRASO_RESPONSAVEL" || tipo === "ALERTA_CRITICO") {
        recipientIds = [...(o.responsavelId ? [o.responsavelId] : []), ...managerIds];
      } else {
        recipientIds = [...managerIds];
      }
      recipientIds = [...new Set(recipientIds)];
      if (recipientIds.length === 0) continue;

      const existing = await prisma.checklistEscalationLog.findMany({
        where: { occurrenceId: o.id, tipo, destinatarioId: { in: recipientIds } },
        select: { destinatarioId: true },
      });
      const already = new Set(existing.map((e) => e.destinatarioId));
      const pending = recipientIds.filter((id) => !already.has(id));
      if (pending.length === 0) continue;

      const { title, body } = escalationMessage(tipo, {
        name: o.template.name,
        empresaName: o.empresa.name,
        setor: o.template.setor,
        minutesLate,
        responsavelName: o.responsavel?.name ?? null,
      });
      const priority = CHECKLIST_ESCALATION_PRIORITY[tipo];

      for (const destinatarioId of pending) {
        const notification = await prisma.notification.create({
          data: {
            userId: destinatarioId,
            type: `CHECKLIST_${tipo}`,
            title,
            body,
            priority,
            checklistOccurrenceId: o.id,
          },
        });
        await prisma.checklistEscalationLog.create({
          data: { occurrenceId: o.id, tipo, destinatarioId, notificationId: notification.id },
        });
        notified += 1;
      }
    }

    if (levels.includes("NAO_REALIZADO") && o.status !== "NAO_REALIZADO") {
      await prisma.checklistOccurrence.update({ where: { id: o.id }, data: { status: "NAO_REALIZADO" } });
    }
  }

  return { notified };
}
