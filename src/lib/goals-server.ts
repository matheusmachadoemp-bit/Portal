import { prisma } from "@/lib/prisma";
import { computeGoalStatus, isAverageGoalUnit, GOAL_CATEGORY_LABEL, GOAL_CATEGORY_ROUTE, type GoalCategoryKey } from "@/lib/goals";
import { formatNumber } from "@/lib/calc";
import { getStoreManagers } from "@/lib/manutencao-server";
import { createNotifications } from "@/lib/notifications";

/**
 * "Valor realizado" de uma meta a partir dos `GoalWeeklyUpdate` já
 * lançados: soma para metas cumulativas (padrão — quantidade vendida, R$
 * gasto/faturado), MÉDIA para metas em "%" (ver `isAverageGoalUnit` em
 * src/lib/goals.ts) — somar percentuais de semanas diferentes não tem
 * significado (5 semanas de ~30% cada não é "150%" de nada). A média usa
 * `_count` (quantas semanas foram REALMENTE lançadas), não o total de
 * semanas do período (`weeksInGoalPeriod`) — nem todas podem estar
 * lançadas ainda, e dividir pelo total penalizaria uma meta só porque
 * ainda faltam semanas para lançar.
 */
export async function computeValorRealizado(goalId: string, unidade: string): Promise<number> {
  const agg = await prisma.goalWeeklyUpdate.aggregate({
    where: { goalId },
    _sum: { valor: true },
    _count: true,
  });

  if (isAverageGoalUnit(unidade)) {
    return agg._count > 0 ? (agg._sum.valor ?? 0) / agg._count : 0;
  }
  return agg._sum.valor ?? 0;
}

/**
 * Recalcula `Goal.valorRealizado` (ver `computeValorRealizado` acima) e o
 * `status`, que depende dele — chamado sempre que um lançamento semanal é
 * criado, editado ou excluído (ver rotas em
 * src/app/api/metas/[id]/semanas/**). Nunca mais é a rota de criar/editar
 * meta quem escreve `valorRealizado` diretamente.
 */
export async function recomputeGoalRealizado(goalId: string) {
  const goal = await prisma.goal.findUniqueOrThrow({ where: { id: goalId } });
  const valorRealizado = await computeValorRealizado(goalId, goal.unidade);
  const status = computeGoalStatus(valorRealizado, goal.valorMeta, goal.endDate, new Date(), goal.direcao, goal.unidade);

  return prisma.goal.update({
    where: { id: goalId },
    data: { valorRealizado, status: status as never },
  });
}

/**
 * Resolve `Goal.responsavelEmployeeId` a partir do texto já digitado em `responsavel` — mesmo
 * espírito do backfill de dado que preencheu esse campo pras metas já existentes (migration
 * 20261002212102_goal_responsavel_employee_backfill), aplicado agora na criação/edição, pra meta
 * nova (ou reatribuída) não ficar presa só no cruzamento por texto de `loadRotinaMetas`
 * (src/lib/inicio.ts) esperando um backfill futuro que não vai rodar de novo.
 *
 * Critério conservador — "sem vínculo" (`null`, cai pro cruzamento por texto que já existe hoje)
 * é sempre preferível a vincular errado:
 *   - Nunca resolve para categoria GERENCIA: responsável de meta de Gerência é sempre um PAPEL
 *     fixo ("Gerente", ver `GERENCIA_RESPONSAVEL` acima), nunca uma pessoa específica.
 *   - Só casa `Employee` ATIVO da MESMA loja (`empresaId`) — nunca entre lojas diferentes, mesmo
 *     que o nome coincida. Diferente do backfill (que também casa `Employee` não-ativo, pra não
 *     perder o vínculo de meta ANTIGA com alguém já desligado): aqui o texto está sendo
 *     digitado/confirmado AGORA, então o candidato certo é sempre alguém atualmente ativo.
 *   - Comparação por igualdade de texto, sem diferenciar maiúsculas/minúsculas nem espaços nas
 *     pontas — mesma tolerância do backfill e de `loadRotinaMetas`.
 *   - Só preenche quando existe EXATAMENTE 1 `Employee` ativo daquela loja com esse nome —
 *     nome ambíguo fica sem vínculo (`null`) em vez de arriscar escolher a pessoa errada.
 */
export async function resolveResponsavelEmployeeId(
  empresaId: string,
  category: string,
  responsavel: string | null | undefined
): Promise<string | null> {
  if (category === "GERENCIA") return null;
  const nome = (responsavel ?? "").trim();
  if (!nome) return null;

  const candidatos = await prisma.employee.findMany({
    where: { empresaId, status: "ATIVO", name: { equals: nome, mode: "insensitive" } },
    select: { id: true },
  });
  return candidatos.length === 1 ? candidatos[0].id : null;
}

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
      direcao: true,
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
      const status = computeGoalStatus(goal.valorRealizado, goal.valorMeta, goal.endDate, now, goal.direcao, goal.unidade);
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
