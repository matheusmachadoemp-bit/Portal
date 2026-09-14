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

export type LiderancaResumoDTO = {
  faturamentoTotalValor: number | null;
  cmvPercent: number | null;
  npsPercent: number | null;
  cancelamentoDeliveryPercent: number | null;
  turnoverPercent: number | null;
  checklistOperacionalPercent: number | null;
  /**
   * Se cada uma das outras 4 reuniões já tem um fechamento lançado nesse
   * período (existe uma linha em Gerente/Salao/Kitchen/DeliveryMeeting) —
   * diferente de "o número existe", já que faturamento/CMV/NPS/cancelamento
   * são calculados direto de Vendas/CRM/Estoque e ficam disponíveis mesmo
   * sem ninguém ter revisado/fechado o mês daquela área ainda. Serve pra
   * quem for montar a tela distinguir "área ainda não fechou o mês" de
   * "fechou e o número é genuinamente zero/nulo".
   */
  fontes: {
    gerente: boolean;
    salao: boolean;
    cozinha: boolean;
    delivery: boolean;
  };
};

/**
 * "Resultado do período" da Reunião Liderança — resumo consolidado dos
 * números principais das outras 4 reuniões do mesmo período. Nunca é
 * digitado à mão nem gravado em coluna própria (ver comentário de
 * LiderancaMeeting em schema.prisma): é recalculado do zero a cada consulta,
 * então nunca desatualiza mesmo que Cozinha/Salão/Delivery/Gerente daquele
 * período sejam editados depois de a Liderança já ter "fechado" o mês.
 *
 * Escolha dos 6 números consolidados (1 justificativa cada, cobrindo as 4
 * áreas sem repetir a mesma dimensão duas vezes):
 * - `faturamentoTotalValor`/`cmvPercent`/`npsPercent`/
 *   `cancelamentoDeliveryPercent`: os mesmos 4 já calculados por
 *   `computeGerenteMetrics` (Faturamento e CMV vêm da Cozinha, NPS vem do
 *   Salão, Cancelamento vem do Delivery) — reaproveitados tal e qual (sem
 *   duplicar a lógica de cálculo) porque já são os 4 números que a própria
 *   Reunião Gerente usa como resumo de topo, então a Liderança consolidada
 *   mostra exatamente os mesmos números que o Gerente já vê, mais dois:
 * - `turnoverPercent`/`checklistOperacionalPercent`: os 2 únicos números que
 *   NÃO são recalculáveis a partir de Vendas/CRM/Estoque (só existem porque
 *   alguém digitou no "Resultado do período" da Reunião Gerente) — trazidos
 *   pra cá pra garantir que a Liderança também enxergue a dimensão de
 *   pessoas (turnover) e de execução operacional (checklist), que senão
 *   ficariam de fora do resumo.
 */
export async function computeLiderancaResumo(empresaId: string, periodo: string): Promise<LiderancaResumoDTO> {
  const [gerenteMetrics, gerenteMeeting, salaoMeeting, kitchenMeeting, deliveryMeeting] = await Promise.all([
    computeGerenteMetrics(empresaId, periodo),
    prisma.gerenteMeeting.findUnique({
      where: { empresaId_periodo: { empresaId, periodo } },
      select: { turnoverPercent: true, checklistOperacionalPercent: true },
    }),
    prisma.salaoMeeting.findUnique({ where: { empresaId_periodo: { empresaId, periodo } }, select: { id: true } }),
    prisma.kitchenMeeting.findUnique({ where: { empresaId_periodo: { empresaId, periodo } }, select: { id: true } }),
    prisma.deliveryMeeting.findUnique({ where: { empresaId_periodo: { empresaId, periodo } }, select: { id: true } }),
  ]);

  return {
    faturamentoTotalValor: gerenteMetrics.faturamentoTotalValor,
    cmvPercent: gerenteMetrics.cmvPercent,
    npsPercent: gerenteMetrics.npsPercent,
    cancelamentoDeliveryPercent: gerenteMetrics.cancelamentoDeliveryPercent,
    turnoverPercent: gerenteMeeting?.turnoverPercent ?? null,
    checklistOperacionalPercent: gerenteMeeting?.checklistOperacionalPercent ?? null,
    fontes: {
      gerente: gerenteMeeting !== null,
      salao: salaoMeeting !== null,
      cozinha: kitchenMeeting !== null,
      delivery: deliveryMeeting !== null,
    },
  };
}

export type ReuniaoMeetingKeyDTO = "GERENTE" | "SALAO" | "COZINHA" | "DELIVERY" | "LIDERANCA";

export type ReuniaoCustomIndicatorDTO = {
  id: string;
  nome: string;
  icon: string;
  unidade: "PERCENT" | "CURRENCY" | "NUMBER";
  valorPadrao: number;
  valor: number | null;
  valorReferencia: number;
};

/** @deprecated Use `ReuniaoCustomIndicatorDTO` — mantido só para não quebrar o import
 * já existente em gerente-client.tsx (mesma forma, generalizada em
 * 20260914150000_reuniao_custom_indicador_compartilhado). */
export type GerenteCustomIndicatorDTO = ReuniaoCustomIndicatorDTO;

/**
 * Lista de indicadores da seção "Fechamento do mês" de uma das 5 reuniões
 * (`meetingKey` diz de qual) — cada um com o `valor` (Resultado do período,
 * digitado à parte, quando existir pra essa reunião) e o `valorReferencia`
 * (o único número que essa seção grava, sem meta-alvo nem premiação) já
 * resolvidos para o período — caindo no padrão do indicador (valorPadrao)
 * enquanto o período ainda não tem um valor salvo. Mecanismo único
 * (ReuniaoCustomIndicator/Value, ver schema.prisma) compartilhado pelas 5
 * reuniões desde 20260914150000_reuniao_custom_indicador_compartilhado — sem
 * nenhuma distinção de código entre indicadores migrados de campos antes
 * fixos (ex.: Faturamento Total do Gerente, CMV da Cozinha) e os criados
 * livremente (ex.: Ticket Médio Salão/Delivery).
 */
export async function loadReuniaoCustomIndicators(
  empresaId: string,
  meetingKey: ReuniaoMeetingKeyDTO,
  periodo: string
): Promise<ReuniaoCustomIndicatorDTO[]> {
  const indicators = await prisma.reuniaoCustomIndicator.findMany({
    where: { empresaId, meetingKey },
    orderBy: { order: "asc" },
  });
  if (indicators.length === 0) return [];

  const values = await prisma.reuniaoCustomIndicatorValue.findMany({
    where: { indicatorId: { in: indicators.map((i) => i.id) }, periodo },
  });
  const valueByIndicator = new Map(values.map((v) => [v.indicatorId, v]));

  return indicators.map((ind) => {
    const v = valueByIndicator.get(ind.id);
    return {
      id: ind.id,
      nome: ind.nome,
      icon: ind.icon,
      unidade: ind.unidade,
      valorPadrao: ind.valorPadrao,
      valor: v?.valor ?? null,
      valorReferencia: v?.valorReferencia ?? ind.valorPadrao,
    };
  });
}

/** @deprecated Use `loadReuniaoCustomIndicators(empresaId, "GERENTE", periodo)` —
 * mantida só para não quebrar o import já existente em gerente/page.tsx. */
export async function loadGerenteCustomIndicators(empresaId: string, periodo: string): Promise<ReuniaoCustomIndicatorDTO[]> {
  return loadReuniaoCustomIndicators(empresaId, "GERENTE", periodo);
}

export type ReuniaoCustomIndicatorInput = { id: string; valor?: string | number; valorReferencia?: string | number };

/**
 * Salva os valores da seção "Fechamento do mês" enviados junto do POST de
 * cada reunião (`body.customIndicators`) — só grava indicadores que já
 * existem, são dessa empresa e dessa reunião específica (`meetingKey`);
 * qualquer outro id é ignorado silenciosamente (ex.: indicador excluído por
 * outra aba entre a tela carregar e o usuário salvar). Extraído aqui porque
 * as 5 rotas POST /api/reuniao/{sub} repetem exatamente essa lógica.
 */
export async function upsertReuniaoCustomIndicatorValues(
  empresaId: string,
  meetingKey: ReuniaoMeetingKeyDTO,
  periodo: string,
  customIndicators: ReuniaoCustomIndicatorInput[]
): Promise<void> {
  if (customIndicators.length === 0) return;

  const indicators = await prisma.reuniaoCustomIndicator.findMany({
    where: { id: { in: customIndicators.map((c) => c.id) }, empresaId, meetingKey },
  });
  const indicatorById = new Map(indicators.map((i) => [i.id, i]));

  await Promise.all(
    customIndicators
      .filter((c) => indicatorById.has(c.id))
      .map((c) => {
        const indicator = indicatorById.get(c.id)!;
        const valor = c.valor !== undefined && c.valor !== "" ? Number(c.valor) : null;
        const valorReferencia =
          c.valorReferencia !== undefined && c.valorReferencia !== "" ? Number(c.valorReferencia) : indicator.valorPadrao;
        return prisma.reuniaoCustomIndicatorValue.upsert({
          where: { indicatorId_periodo: { indicatorId: c.id, periodo } },
          update: { valor, valorReferencia },
          create: { indicatorId: c.id, periodo, valor, valorReferencia },
        });
      })
  );
}

export const REUNIAO_INDICATOR_UNIDADES = ["PERCENT", "CURRENCY", "NUMBER"] as const;

/**
 * Cria um novo indicador na seção "Fechamento do mês" de uma reunião
 * específica (`meetingKey`) — sempre no fim da lista (maior `order` + 1)
 * daquela empresa+reunião. Extraído aqui porque as 5 rotas
 * POST /api/reuniao/{sub}/indicadores repetem exatamente essa lógica; cada
 * rota só cuida da validação/mensagem de erro específica da sua tela antes
 * de chamar isto.
 */
export async function createReuniaoCustomIndicator(params: {
  empresaId: string;
  meetingKey: ReuniaoMeetingKeyDTO;
  nome: string;
  icon: string;
  unidade: (typeof REUNIAO_INDICATOR_UNIDADES)[number];
  valorPadrao: number;
  createdById: string;
}) {
  const maxOrder = await prisma.reuniaoCustomIndicator.aggregate({
    where: { empresaId: params.empresaId, meetingKey: params.meetingKey },
    _max: { order: true },
  });

  return prisma.reuniaoCustomIndicator.create({
    data: {
      empresaId: params.empresaId,
      meetingKey: params.meetingKey,
      nome: params.nome,
      icon: params.icon,
      unidade: params.unidade,
      valorPadrao: params.valorPadrao,
      order: (maxOrder._max.order ?? 0) + 1,
      createdById: params.createdById,
    },
  });
}

/**
 * Busca um indicador pelo id, mas só devolve algo se ele realmente for dessa
 * empresa E dessa reunião (`meetingKey`) — dupla checagem de posse usada
 * pelas rotas PATCH/DELETE /api/reuniao/{sub}/indicadores/{id}, pra uma
 * rota de uma reunião nunca conseguir editar/excluir o indicador de outra
 * (mesmo que alguém descubra/adivinhe o id).
 */
export async function findReuniaoCustomIndicatorForMeeting(id: string, empresaId: string, meetingKey: ReuniaoMeetingKeyDTO) {
  const indicator = await prisma.reuniaoCustomIndicator.findUnique({ where: { id } });
  if (!indicator || indicator.empresaId !== empresaId || indicator.meetingKey !== meetingKey) return null;
  return indicator;
}

/**
 * Regra do portal: toda subcategoria de Reunião cujo "Resultado do período"
 * dependa de alguém preencher um formulário mensal (uma linha por
 * empresa/período, só criada quando alguém salva) precisa desse lembrete —
 * ao adicionar uma nova subcategoria de Reunião nesse formato, adicionar
 * aqui também. Gerente/Salão/Cozinha/Delivery continuam aqui mesmo depois
 * de "Metas e premiação" virar "Fechamento do mês" (20260914140000 e
 * 20260914160000): as 4 ainda têm campos de "Resultado do período" gravados
 * só nessa linha (ex.: notas, NPS detalhado do Salão, tempo de pedido da
 * Cozinha) — o que mudou foi só o texto do lembrete (não fala mais em
 * "metas e premiação", já que isso deixou de existir). "Reunião Liderança"
 * fica de fora de propósito, não por estar incompleta: seu "Resultado do
 * período" é 100% um resumo computado ao vivo a partir das outras 4 (ver
 * `computeLiderancaResumo`), sem nenhum campo que dependa de alguém
 * preencher todo mês — não existe "ainda não fechou o mês" pra ela cobrar.
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
 * de São Paulo) — o resto do mês retorna sem checar nada. No dia 25, o
 * fechamento do mês seguinte ainda não existe em nenhuma subcategoria de
 * Reunião (só é criado quando alguém salva o formulário daquela tela), então
 * usar a ausência dessa linha é o próprio sinal de "ainda não foi feito" —
 * sem precisar de mais uma tabela/flag só pra isso.
 *
 * Ex.: hoje é 25/09 → o mês seguinte é outubro (período "2026-10") → avisa
 * Gerente e Administrador de cada loja, para cada subcategoria (Gerente,
 * Salão, Delivery, Cozinha) que ainda não tem essa linha, com prazo até o
 * dia 05/10 (dia 5 do mês seguinte). "Reunião Liderança" não entra na lista
 * (ver comentário de REUNIAO_META_SUBS acima).
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
      const title = `Feche o mês da ${sub.label} — ${empresa.name}`;

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
          body: `Registre o fechamento do mês de ${targetLabel} até ${deadlineLabel}.`,
          priority: "ATENCAO" as const,
          url: `/portal/reuniao/${sub.key}`,
        }))
      );
      notified += managerIds.length;
    }
  }

  return { notified };
}
