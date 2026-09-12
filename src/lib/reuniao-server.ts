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
 * Roda diariamente (ver vercel.json), mas só faz alguma coisa no dia 25 (hora
 * de São Paulo) — o resto do mês retorna sem checar nada. No dia 25, as metas
 * do mês seguinte ainda não existem (só são criadas quando alguém salva o
 * formulário "Metas e premiação" em Reunião Gerente), então usar a ausência
 * dessa linha em GerenteMeeting é o próprio sinal de "ainda não foi
 * definida" — sem precisar de mais uma tabela/flag só pra isso.
 *
 * Ex.: hoje é 25/09 → o mês seguinte é outubro (período "2026-10") → avisa
 * Gerente e Administrador de cada loja que ainda não tem essa linha, com
 * prazo até o dia 05/10 (dia 5 do mês seguinte).
 */
export async function processGerenteMetaReminders(now: Date = new Date()): Promise<{ notified: number }> {
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

  const empresas = await prisma.empresa.findMany({ where: { active: true }, select: { id: true } });

  let notified = 0;
  for (const empresa of empresas) {
    const jaDefinida = await prisma.gerenteMeeting.findUnique({
      where: { empresaId_periodo: { empresaId: empresa.id, periodo: targetPeriodo } },
      select: { id: true },
    });
    if (jaDefinida) continue;

    const managerIds = await getStoreManagers(empresa.id);
    if (managerIds.length === 0) continue;

    // Evita duplicar caso o cron seja re-executado no mesmo dia (ex.: retry do Vercel).
    const jaNotificadoHoje = await prisma.notification.findFirst({
      where: {
        type: "REUNIAO_GERENTE_METAS_PENDENTE",
        userId: { in: managerIds },
        createdAt: { gte: new Date(Date.now() - 20 * 60 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (jaNotificadoHoje) continue;

    await createNotifications(
      managerIds.map((userId) => ({
        userId,
        type: "REUNIAO_GERENTE_METAS_PENDENTE",
        title: "Defina as metas da Reunião Gerente",
        body: `Configure as metas e premiação de ${targetLabel} até ${deadlineLabel}.`,
        priority: "ATENCAO" as const,
        url: "/portal/reuniao/gerente",
      }))
    );
    notified += managerIds.length;
  }

  return { notified };
}
