import { prisma } from "@/lib/prisma";
import { computeGoalStatus, GOAL_CATEGORY_LABEL, GOAL_CATEGORY_ROUTE, type GoalCategoryKey } from "@/lib/goals";
import { formatNumber } from "@/lib/calc";
import { getStoreManagers } from "@/lib/manutencao-server";
import { createNotifications } from "@/lib/notifications";

/**
 * Roda diariamente (ver vercel.json): toda meta cujo período já terminou e
 * ainda não teve alerta disparado é reavaliada — se ficou "NAO_ATINGIDA",
 * gerentes e administradores da loja são notificados. `alertaEnviado`
 * garante que cada meta só gera notificação uma vez.
 */
export async function processGoalAlerts(): Promise<{ checked: number; notified: number }> {
  const now = new Date();
  const goals = await prisma.goal.findMany({
    where: { endDate: { lt: now }, alertaEnviado: false },
    select: {
      id: true,
      empresaId: true,
      name: true,
      category: true,
      valorMeta: true,
      valorRealizado: true,
      unidade: true,
      endDate: true,
    },
  });

  // Uma busca de gerentes por loja distinta (não por meta) — várias metas
  // vencidas costumam ser da mesma loja, mesmo padrão já usado em
  // processChecklistEscalations (src/lib/checklist-server.ts).
  const distinctEmpresaIds = [...new Set(goals.map((g) => g.empresaId))];
  const managersByEmpresa = new Map(
    await Promise.all(distinctEmpresaIds.map(async (empresaId) => [empresaId, await getStoreManagers(empresaId)] as const))
  );

  // Cada meta é processada (notificação + update) de forma independente das
  // demais — dá pra rodar em paralelo em vez de uma de cada vez.
  const notifiedCounts = await Promise.all(
    goals.map(async (goal) => {
      const status = computeGoalStatus(goal.valorRealizado, goal.valorMeta, goal.endDate, now);
      let notifiedForGoal = 0;

      if (status === "NAO_ATINGIDA") {
        const managerIds = managersByEmpresa.get(goal.empresaId) ?? [];
        const categoryLabel = GOAL_CATEGORY_LABEL[goal.category as GoalCategoryKey] ?? goal.category;
        const title = `Meta não atingida: ${goal.name}`;
        const body = `${categoryLabel} — realizado ${formatNumber(goal.valorRealizado)} de ${formatNumber(goal.valorMeta)} ${goal.unidade}.`;

        if (managerIds.length > 0) {
          const categoryKey = goal.category as GoalCategoryKey;
          await createNotifications(
            managerIds.map((userId) => ({
              userId,
              type: "META_NAO_ATINGIDA",
              title,
              body,
              priority: "ATENCAO" as const,
              goalId: goal.id,
              url: `/portal/metas/${GOAL_CATEGORY_ROUTE[categoryKey]}`,
            }))
          );
          notifiedForGoal = managerIds.length;
        }
      }

      await prisma.goal.update({
        where: { id: goal.id },
        data: { status: status as never, alertaEnviado: true },
      });

      return notifiedForGoal;
    })
  );

  return { checked: goals.length, notified: notifiedCounts.reduce((a, b) => a + b, 0) };
}
