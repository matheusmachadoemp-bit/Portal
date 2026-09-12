import { prisma } from "@/lib/prisma";
import { breakdownMovimentacoesNoPeriodo, cmvRealValor, valorEstoqueEm } from "@/lib/cmv";
import { safeDiv } from "@/lib/calc";
import { periodoRange, periodoLabel, nextPeriodo } from "@/lib/reuniao";
import { spDateKey } from "@/lib/checklist";
import { getStoreManagers } from "@/lib/manutencao-server";
import { createNotifications } from "@/lib/notifications";

/**
 * CMV real (%) e desperdício (R$) do mês, calculados a partir do Estoque
 * (StockMovement) e Perdas (Loss) já existentes — sem precisar digitar nada.
 */
export async function computeCozinhaMetrics(empresaId: string, periodo: string) {
  const { start, end } = periodoRange(periodo);

  const [ingredients, movements, salesEntries, losses] = await Promise.all([
    prisma.ingredient.findMany({ where: { empresaId } }),
    prisma.stockMovement.findMany({ where: { empresaId }, orderBy: { createdAt: "desc" } }),
    prisma.salesEntry.findMany({ where: { empresaId, date: { gte: start, lt: end } } }),
    prisma.loss.aggregate({ where: { empresaId, data: { gte: start, lt: end } }, _sum: { valorEstimado: true } }),
  ]);

  const estoqueInicial = valorEstoqueEm(ingredients, movements, start);
  const estoqueFinal = valorEstoqueEm(ingredients, movements, end);
  const breakdown = breakdownMovimentacoesNoPeriodo(ingredients, movements, start, end);
  const custoConsumido = cmvRealValor(
    estoqueInicial + breakdown.transferenciasRecebidas,
    breakdown.compras - breakdown.transferenciasEnviadas - breakdown.devolucoes + breakdown.ajustes,
    estoqueFinal
  );

  const faturamento = salesEntries.reduce((s, e) => s + e.faturamentoDelivery + e.faturamentoSalao, 0);
  const cmvPercent = faturamento > 0 ? safeDiv(custoConsumido, faturamento) * 100 : null;
  const desperdicioValor = losses._sum.valorEstimado ?? 0;

  return { cmvPercent, desperdicioValor, faturamento };
}

/**
 * NPS geral (%), faturamento do salão (R$) e ticket médio (R$) do mês,
 * calculados a partir do CRM (NpsResponse) e Vendas (SalesEntry) já
 * existentes — sem precisar digitar nada.
 */
export async function computeSalaoMetrics(empresaId: string, periodo: string) {
  const { start, end } = periodoRange(periodo);

  const [respostas, salesEntries] = await Promise.all([
    prisma.npsResponse.findMany({ where: { empresaId, createdAt: { gte: start, lt: end } }, select: { nota: true } }),
    prisma.salesEntry.findMany({
      where: { empresaId, date: { gte: start, lt: end } },
      select: { faturamentoSalao: true, pedidosSalao: true },
    }),
  ]);

  const promotores = respostas.filter((r) => r.nota >= 9).length;
  const detratores = respostas.filter((r) => r.nota <= 6).length;
  const npsPercent = respostas.length > 0 ? ((promotores - detratores) / respostas.length) * 100 : null;

  const faturamentoValor = salesEntries.reduce((s, e) => s + e.faturamentoSalao, 0);
  const pedidosSalao = salesEntries.reduce((s, e) => s + e.pedidosSalao, 0);
  const ticketMedioValor = pedidosSalao > 0 ? safeDiv(faturamentoValor, pedidosSalao) : null;

  return { npsPercent, faturamentoValor, ticketMedioValor };
}

/**
 * Vendedor com maior soma de vendas no período — puxado automaticamente
 * das Vendas por Garçom (WaiterSaleEntry) já existentes.
 */
export async function computeMelhorVendedor(empresaId: string, periodo: string) {
  const { start, end } = periodoRange(periodo);

  const grupos = await prisma.waiterSaleEntry.groupBy({
    by: ["employeeId"],
    where: { empresaId, date: { gte: start, lt: end } },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
    take: 1,
  });

  const top = grupos[0];
  if (!top || !top._sum.amount) return { nome: null, valor: null };

  const employee = await prisma.employee.findUnique({ where: { id: top.employeeId }, select: { name: true } });
  return { nome: employee?.name ?? null, valor: top._sum.amount };
}

/**
 * Comentários de clientes em destaque (notas altas, com texto) no
 * período — puxados automaticamente do CRM (NpsResponse) já existente.
 */
export async function computeComentariosDestaque(empresaId: string, periodo: string, take = 5) {
  const { start, end } = periodoRange(periodo);

  const respostas = await prisma.npsResponse.findMany({
    where: { empresaId, createdAt: { gte: start, lt: end }, nota: { gte: 9 }, comentario: { not: null } },
    orderBy: { nota: "desc" },
    take,
    select: { comentario: true, nota: true, cliente: { select: { nome: true } } },
  });

  return respostas
    .filter((r) => r.comentario && r.comentario.trim())
    .map((r) => ({ nome: r.cliente?.nome ?? "Cliente", comentario: r.comentario as string, nota: r.nota }));
}

/**
 * % de cancelamento dos pedidos de delivery no mês, calculado a partir
 * das Vendas (Sale: channel=DELIVERY) já existentes — sem precisar
 * digitar nada.
 */
export async function computeDeliveryMetrics(empresaId: string, periodo: string) {
  const { start, end } = periodoRange(periodo);

  const vendas = await prisma.sale.findMany({
    where: { empresaId, channel: "DELIVERY", dateTime: { gte: start, lt: end } },
    select: { cancelado: true },
  });

  const cancelamentoPercent = vendas.length > 0 ? (vendas.filter((v) => v.cancelado).length / vendas.length) * 100 : null;

  return { cancelamentoPercent };
}

/**
 * Faturamento total, CMV, NPS geral e cancelamento de delivery do mês —
 * um resumo consolidado puxado automaticamente do que já é calculado nas
 * reuniões de Cozinha, Salão e Delivery, sem precisar digitar nada.
 */
export async function computeGerenteMetrics(empresaId: string, periodo: string) {
  const [cozinha, salao, delivery] = await Promise.all([
    computeCozinhaMetrics(empresaId, periodo),
    computeSalaoMetrics(empresaId, periodo),
    computeDeliveryMetrics(empresaId, periodo),
  ]);

  const faturamentoTotalValor = cozinha.faturamento;

  return {
    faturamentoTotalValor,
    cmvPercent: cozinha.cmvPercent,
    npsPercent: salao.npsPercent,
    cancelamentoDeliveryPercent: delivery.cancelamentoPercent,
  };
}

/**
 * Regra do portal: toda subcategoria de Reunião que tenha metas/premiação
 * mensais (uma linha por empresa/período, só criada quando alguém salva o
 * formulário) precisa desse lembrete — ao adicionar uma nova subcategoria
 * de Reunião com esse formato, adicionar aqui também.
 */
const REUNIAO_META_SUBS = [
  { key: "gerente", label: "Reunião Gerente", findMeeting: (empresaId: string, periodo: string) => prisma.gerenteMeeting.findUnique({ where: { empresaId_periodo: { empresaId, periodo } }, select: { id: true } }) },
  { key: "salao", label: "Reunião Salão", findMeeting: (empresaId: string, periodo: string) => prisma.salaoMeeting.findUnique({ where: { empresaId_periodo: { empresaId, periodo } }, select: { id: true } }) },
  { key: "delivery", label: "Reunião Delivery", findMeeting: (empresaId: string, periodo: string) => prisma.deliveryMeeting.findUnique({ where: { empresaId_periodo: { empresaId, periodo } }, select: { id: true } }) },
  { key: "cozinha", label: "Reunião Cozinha", findMeeting: (empresaId: string, periodo: string) => prisma.kitchenMeeting.findUnique({ where: { empresaId_periodo: { empresaId, periodo } }, select: { id: true } }) },
] as const;

/** Prefixo comum dos `type` de Notification gerados por essa rotina — ver notification-bell.tsx. */
export const REUNIAO_METAS_PENDENTE_PREFIX = "REUNIAO_METAS_PENDENTE_";

/**
 * Roda diariamente (ver vercel.json), mas só faz alguma coisa no dia 25 (hora
 * de São Paulo) — o resto do mês retorna sem checar nada. No dia 25, as metas
 * do mês seguinte ainda não existem em nenhuma subcategoria de Reunião (só
 * são criadas quando alguém salva o formulário "Metas e premiação" daquela
 * tela), então usar a ausência dessa linha é o próprio sinal de "ainda não
 * foi definida" — sem precisar de mais uma tabela/flag só pra isso.
 *
 * Ex.: hoje é 25/09 → o mês seguinte é outubro (período "2026-10") → avisa
 * Gerente e Administrador de cada loja, para cada subcategoria (Gerente,
 * Salão, Delivery, Cozinha) que ainda não tem essa linha, com prazo até o
 * dia 05/10 (dia 5 do mês seguinte). "Reunião Liderança" ainda não tem
 * metas/premiação implementadas (tela "Em construção"), por isso não entra
 * na lista acima ainda.
 */
export async function processReuniaoMetaReminders(now: Date = new Date()): Promise<{ notified: number }> {
  const todayKey = spDateKey(now);
  const day = Number(todayKey.slice(8, 10));
  if (day !== 25) return { notified: 0 };

  const periodoAtual = todayKey.slice(0, 7);
  const targetPeriodo = nextPeriodo(periodoAtual);
  const targetLabel = periodoLabel(targetPeriodo);
  const { start: targetStart } = periodoRange(targetPeriodo);
  const deadlineLabel = new Date(Date.UTC(targetStart.getUTCFullYear(), targetStart.getUTCMonth(), 5)).toLocaleDateString(
    "pt-BR",
    { day: "2-digit", month: "2-digit", timeZone: "UTC" }
  );

  const empresas = await prisma.empresa.findMany({ where: { active: true }, select: { id: true, name: true } });

  let notified = 0;
  for (const sub of REUNIAO_META_SUBS) {
    const notificationType = `${REUNIAO_METAS_PENDENTE_PREFIX}${sub.key.toUpperCase()}`;

    for (const empresa of empresas) {
      const jaDefinida = await sub.findMeeting(empresa.id, targetPeriodo);
      if (jaDefinida) continue;

      const managerIds = await getStoreManagers(empresa.id);
      if (managerIds.length === 0) continue;

      // O título leva o nome da loja de propósito: além de deixar claro pra quem
      // administra mais de uma loja (ex.: o Administrador) qual delas está com
      // metas pendentes, isso também é o que distingue essa checagem de duplicidade
      // por loja — sem incluir a loja aqui, o Administrador (que aparece em
      // managerIds de todas as lojas) ficaria marcado como "já notificado hoje" já
      // na primeira loja processada e nunca receberia o aviso das demais.
      const title = `Defina as metas da ${sub.label} — ${empresa.name}`;

      // Evita duplicar caso o cron seja re-executado no mesmo dia (ex.: retry do Vercel).
      const jaNotificadoHoje = await prisma.notification.findFirst({
        where: {
          type: notificationType,
          title,
          userId: { in: managerIds },
          createdAt: { gte: new Date(Date.now() - 20 * 60 * 60 * 1000) },
        },
        select: { id: true },
      });
      if (jaNotificadoHoje) continue;

      await createNotifications(
        managerIds.map((userId) => ({
          userId,
          type: notificationType,
          title,
          body: `Configure as metas e premiação de ${targetLabel} até ${deadlineLabel}.`,
          priority: "ATENCAO" as const,
          url: `/portal/reuniao/${sub.key}`,
        }))
      );
      notified += managerIds.length;
    }
  }

  return { notified };
}
