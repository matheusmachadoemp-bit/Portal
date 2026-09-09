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
import { createNotification } from "@/lib/notifications";

/**
 * Gera (de forma idempotente, via @@unique([templateId, date])) as
 * ocorrências do dia `dateKey` para os templates ativos das empresas
 * informadas — só nos dias da semana marcados no template.
 */
export async function generateChecklistOccurrences(empresaIds: string[], dateKey: string = spDateKey()) {
  if (empresaIds.length === 0) return;

  const day = spStartOfDay(dateKey);
  const weekdayField = weekdayFieldFor(dateKey);

  // Só os campos usados para montar a ocorrência — o restante do template
  // (descrição, regras de cobrança, etc.) não é lido aqui.
  const templates = await prisma.checklistTemplate.findMany({
    where: {
      empresaId: { in: empresaIds },
      active: true,
      startDate: { lte: day },
      OR: [{ endDate: null }, { endDate: { gte: day } }],
      [weekdayField]: true,
    },
    select: { id: true, empresaId: true, releaseTime: true, dueTime: true, responsavelId: true },
  });

  await Promise.all(
    templates.map((t) => {
      const releaseAt = spDateTime(dateKey, t.releaseTime);
      const dueAt = spDateTime(dateKey, t.dueTime);
      return prisma.checklistOccurrence.upsert({
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
    })
  );
}

/** Recalcula (e persiste, se mudou) o status "ao vivo" de cada ocorrência. */
export async function refreshOccurrenceStatuses(occurrenceIds: string[]) {
  if (occurrenceIds.length === 0) return;
  // Só os campos usados pelo cálculo de status — não a ocorrência inteira
  // (que carregaria justificativa/campos de comprovação sem necessidade).
  const occurrences = await prisma.checklistOccurrence.findMany({
    where: { id: { in: occurrenceIds } },
    select: { id: true, releaseAt: true, dueAt: true, startedAt: true, completedAt: true, status: true },
  });
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

// ---------------------------------------------------------------------------
// Ocorrências do dia, prontas para consumo (Fase 1b/2 — Tela de Início) —
// junta os 3 passos que `loadRotinaChecklist` e `loadAlertaChecklistAtrasado`
// (src/lib/inicio.ts) faziam cada um por conta própria: gerar as ocorrências
// do dia, buscá-las (com o template completo) e atualizar o status "ao
// vivo" de cada uma. As duas rotas que usam essas funções
// (/api/inicio/rotina e /api/inicio/alertas) são chamadas em paralelo pelo
// navegador na Tela de Início — como as duas pedem exatamente os mesmos 3
// passos para a mesma loja+dia, `occurrencesDoDiaInFlight` coalesce
// chamadas concorrentes (mesma chave `empresaId:dateKey`) numa única
// execução, em vez de repetir a geração/busca/atualização duas vezes.
//
// Não é um cache com TTL (não guarda nada depois de resolver): a entrada
// só existe enquanto a promise está em voo e é removida assim que ela
// termina (sucesso ou erro), então uma chamada que chega depois que a
// anterior já terminou sempre dispara uma busca nova — sem janela de dado
// desatualizado. Só reduz trabalho quando as chamadas realmente se
// sobrepõem no tempo, que é exatamente o caso descrito acima.
// ---------------------------------------------------------------------------

const occurrencesDoDiaInFlight = new Map<string, ReturnType<typeof fetchAndRefreshOccurrencesDoDia>>();

async function fetchAndRefreshOccurrencesDoDia(empresaId: string, dateKey: string) {
  await generateChecklistOccurrences([empresaId], dateKey);

  const day = spStartOfDay(dateKey);
  const occurrences = await prisma.checklistOccurrence.findMany({
    where: { empresaId, date: day },
    include: { template: true },
  });
  if (occurrences.length > 0) {
    await refreshOccurrenceStatuses(occurrences.map((o) => o.id));
  }
  return occurrences;
}

/**
 * Gera (se necessário) e devolve TODAS as ocorrências de checklist do dia
 * `dateKey` de uma loja, com o template completo incluído e o status já
 * atualizado no banco (`refreshOccurrenceStatuses`). O `status` de cada
 * ocorrência no retorno é o valor de ANTES do refresh — igual ao que
 * `loadRotinaChecklist`/`loadAlertaChecklistAtrasado` já faziam: cada
 * chamador recalcula o status "ao vivo" localmente com
 * `computeOccurrenceStatus` (mesma fórmula pura usada pelo refresh, com o
 * mesmo `releaseAt`/`dueAt`/`startedAt`/`completedAt`/`status`), então não
 * precisa reler do banco depois de persistir.
 */
export async function loadChecklistOccurrencesDoDia(empresaId: string, dateKey: string) {
  const key = `${empresaId}:${dateKey}`;
  const inFlight = occurrencesDoDiaInFlight.get(key);
  if (inFlight) return inFlight;

  const promise = fetchAndRefreshOccurrencesDoDia(empresaId, dateKey);
  occurrencesDoDiaInFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    occurrencesDoDiaInFlight.delete(key);
  }
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

  // Uma busca por loja distinta (não por ocorrência) — várias ocorrências costumam ser da mesma loja.
  const distinctEmpresaIds = [...new Set(occurrences.map((o) => o.empresaId))];
  const managersByEmpresa = new Map(
    await Promise.all(
      distinctEmpresaIds.map(async (empresaId) => [empresaId, await loadEscalationManagers(empresaId)] as const)
    )
  );

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
    const managerIds = new Set((managersByEmpresa.get(o.empresaId) ?? []).map((m) => m.id));

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

      // Um destinatário nunca depende do outro (cada um recebe sua própria
      // notificação/log) — dá pra disparar em paralelo em vez de um de cada vez.
      await Promise.all(
        pending.map(async (destinatarioId) => {
          const notification = await createNotification({
            userId: destinatarioId,
            type: `CHECKLIST_${tipo}`,
            title,
            body,
            priority,
            checklistOccurrenceId: o.id,
            url: `/portal/tarefas/checklist/executar/${o.id}`,
          });
          await prisma.checklistEscalationLog.create({
            data: { occurrenceId: o.id, tipo, destinatarioId, notificationId: notification.id },
          });
        })
      );
      notified += pending.length;
    }

    if (levels.includes("NAO_REALIZADO") && o.status !== "NAO_REALIZADO") {
      await prisma.checklistOccurrence.update({ where: { id: o.id }, data: { status: "NAO_REALIZADO" } });
    }
  }

  return { notified };
}
