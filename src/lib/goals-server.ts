import { prisma } from "@/lib/prisma";
import { computeGoalStatus, GOAL_CATEGORY_LABEL, type GoalCategoryKey } from "@/lib/goals";
import { formatNumber } from "@/lib/calc";
import { getStoreManagers } from "@/lib/manutencao-server";

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

  let notified = 0;

  for (const goal of goals) {
    const status = computeGoalStatus(goal.valorRealizado, goal.valorMeta, goal.endDate, now);

    if (status === "NAO_ATINGIDA") {
      const managerIds = await getStoreManagers(goal.empresaId);
      const categoryLabel = GOAL_CATEGORY_LABEL[goal.category as GoalCategoryKey] ?? goal.category;
      const title = `Meta não atingida: ${goal.name}`;
      const body = `${categoryLabel} — realizado ${formatNumber(goal.valorRealizado)} de ${formatNumber(goal.valorMeta)} ${goal.unidade}.`;

      if (managerIds.length > 0) {
        await prisma.notification.createMany({
          data: managerIds.map((userId) => ({
            userId,
            type: "META_NAO_ATINGIDA",
            title,
            body,
            priority: "ATENCAO" as const,
            goalId: goal.id,
          })),
        });
        notified += managerIds.length;
      }
    }

    await prisma.goal.update({
      where: { id: goal.id },
      data: { status: status as never, alertaEnviado: true },
    });
  }

  return { checked: goals.length, notified };
}
