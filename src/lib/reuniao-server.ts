import { prisma } from "@/lib/prisma";
import { breakdownMovimentacoesNoPeriodo, cmvRealValor, valorEstoqueEm } from "@/lib/cmv";
import { safeDiv } from "@/lib/calc";
import { periodoRange } from "@/lib/reuniao";

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
  /**
   * Segundo valor (opcional) de um indicador "composto" — ex.: "Cancelamentos"
   * registra um percentual (nome/unidade/valorReferencia acima) + uma
   * quantidade (nomeSecundario/unidadeSecundaria/valorSecundario). `null` nos
   * 3 campos abaixo (sempre juntos — nunca só 1 ou 2 deles) = indicador
   * simples, com 1 valor só, exatamente como todo indicador de hoje.
   *
   * Campos opcionais no tipo (`?:`, não só `| null`) só para não quebrar a
   * construção manual de objeto `FechamentoIndicator` já existente em
   * `src/components/reuniao/fechamento-do-mes.tsx` (`createIndicator`, que
   * não conhece esses 3 campos ainda — Fase 2/tela). Em runtime, toda
   * resposta de `loadReuniaoCustomIndicators`/das rotas de indicadores
   * sempre inclui as 3 chaves (com `null` quando o indicador é simples).
   */
  nomeSecundario?: string | null;
  unidadeSecundaria?: "PERCENT" | "CURRENCY" | "NUMBER" | null;
  valorSecundario?: number | null;
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
      nomeSecundario: ind.nomeSecundario,
      unidadeSecundaria: ind.unidadeSecundaria,
      // Sem fallback pra valorPadrao (não existe "valorPadraoSecundario" — ver
      // comentário de ReuniaoCustomIndicatorValue.valorSecundario em
      // schema.prisma): fica null até alguém salvar um valor de verdade pro
      // período, mesmo quando o indicador já tem unidadeSecundaria configurada.
      valorSecundario: v?.valorSecundario ?? null,
    };
  });
}

/** @deprecated Use `loadReuniaoCustomIndicators(empresaId, "GERENTE", periodo)` —
 * mantida só para não quebrar o import já existente em gerente/page.tsx. */
export async function loadGerenteCustomIndicators(empresaId: string, periodo: string): Promise<ReuniaoCustomIndicatorDTO[]> {
  return loadReuniaoCustomIndicators(empresaId, "GERENTE", periodo);
}

export type ReuniaoCustomIndicatorInput = {
  id: string;
  valor?: string | number;
  valorReferencia?: string | number;
  /** Só é gravado de fato quando o indicador tem `unidadeSecundaria`
   * configurada — ver `upsertReuniaoCustomIndicatorValues` abaixo. */
  valorSecundario?: string | number;
};

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
        // Só grava valorSecundario quando o indicador tem unidadeSecundaria
        // configurada — pra um indicador simples, fica sempre null mesmo que
        // o payload mande algo por engano (evita linha "órfã" sem
        // nomeSecundario/unidadeSecundaria correspondente).
        const valorSecundario =
          indicator.unidadeSecundaria && c.valorSecundario !== undefined && c.valorSecundario !== ""
            ? Number(c.valorSecundario)
            : null;
        return prisma.reuniaoCustomIndicatorValue.upsert({
          where: { indicatorId_periodo: { indicatorId: c.id, periodo } },
          update: { valor, valorReferencia, valorSecundario },
          create: { indicatorId: c.id, periodo, valor, valorReferencia, valorSecundario },
        });
      })
  );
}

export const REUNIAO_INDICATOR_UNIDADES = ["PERCENT", "CURRENCY", "NUMBER"] as const;

/**
 * Resultado de `parseSecondaryIndicatorFields` — ver comentário dela.
 * `touched: false` = o body não tocou em nenhum dos 2 campos (nem
 * `nomeSecundario` nem `unidadeSecundaria`); `touched: true, ok: false` = um
 * estado inválido (só 1 dos 2 preenchido, ou unidade fora da lista
 * conhecida); `touched: true, ok: true` = par válido, já resolvido (os dois
 * `null` juntos, se o body pediu pra limpar/não configurar, ou os dois
 * preenchidos juntos).
 */
export type SecondaryIndicatorFieldsResult =
  | { touched: false }
  | { touched: true; ok: true; nomeSecundario: string | null; unidadeSecundaria: (typeof REUNIAO_INDICATOR_UNIDADES)[number] | null }
  | { touched: true; ok: false; error: string };

/**
 * Valida o par `nomeSecundario`/`unidadeSecundaria` vindo do body de criar
 * (POST .../indicadores) ou editar (PATCH .../indicadores/{id}) um indicador
 * — usada pelas 10 rotas (5 criar + 5 editar) pra não duplicar essa regra em
 * cada uma. Um indicador "composto" (2 valores por período, ex.:
 * Cancelamentos = % + quantidade) precisa dos dois preenchidos juntos; só 1
 * dos dois (ex.: só a unidade, sem nome, ou vice-versa) é um estado inválido
 * que deixaria a Fase 2 (tela) sem saber como rotular o campo que faltou ou
 * qual unidade usar — por isso vira erro 400, não um "ignora e segue".
 *
 * `touched: false` (nenhum dos 2 campos veio no body) tem 2 significados
 * diferentes dependendo de quem chama: na criação, sempre significa
 * "indicador simples, sem segundo valor" (não há nada prévio pra manter);
 * na edição, significa "não mexeu no segundo valor" — quem edita decide se
 * aplica o resultado (só quando `touched && ok`) ou mantém o que já estava
 * salvo (quando `!touched`), exatamente como já se faz com nome/unidade/
 * icon/valorPadrao no PATCH hoje.
 */
export function parseSecondaryIndicatorFields(body: {
  nomeSecundario?: unknown;
  unidadeSecundaria?: unknown;
}): SecondaryIndicatorFieldsResult {
  const nomeProvided = body.nomeSecundario !== undefined;
  const unidadeProvided = body.unidadeSecundaria !== undefined;
  if (!nomeProvided && !unidadeProvided) return { touched: false };

  const nome = typeof body.nomeSecundario === "string" ? body.nomeSecundario.trim() : "";
  const unidade = body.unidadeSecundaria;
  const hasNome = nome !== "";
  const hasUnidade = unidade !== undefined && unidade !== null && unidade !== "";

  if (!hasNome && !hasUnidade) return { touched: true, ok: true, nomeSecundario: null, unidadeSecundaria: null };
  if (hasNome !== hasUnidade) {
    return {
      touched: true,
      ok: false,
      error:
        "Para um indicador com 2 valores, informe o nome e a unidade do segundo valor juntos (ou deixe os dois em branco para um indicador com 1 valor só).",
    };
  }
  if (!REUNIAO_INDICATOR_UNIDADES.includes(unidade as (typeof REUNIAO_INDICATOR_UNIDADES)[number])) {
    return { touched: true, ok: false, error: "Unidade do segundo valor inválida." };
  }
  return {
    touched: true,
    ok: true,
    nomeSecundario: nome,
    unidadeSecundaria: unidade as (typeof REUNIAO_INDICATOR_UNIDADES)[number],
  };
}

/**
 * Cria um novo indicador na seção "Fechamento do mês" de uma reunião
 * específica (`meetingKey`) — sempre no fim da lista (maior `order` + 1)
 * daquela empresa+reunião. Extraído aqui porque as 5 rotas
 * POST /api/reuniao/{sub}/indicadores repetem exatamente essa lógica; cada
 * rota só cuida da validação/mensagem de erro específica da sua tela antes
 * de chamar isto.
 *
 * `nomeSecundario`/`unidadeSecundaria` são opcionais (indicador "composto",
 * ver `parseSecondaryIndicatorFields`) — passe `null` nos dois (ou omita) pra
 * um indicador simples, como todo indicador criado até hoje.
 */
export async function createReuniaoCustomIndicator(params: {
  empresaId: string;
  meetingKey: ReuniaoMeetingKeyDTO;
  nome: string;
  icon: string;
  unidade: (typeof REUNIAO_INDICATOR_UNIDADES)[number];
  valorPadrao: number;
  nomeSecundario?: string | null;
  unidadeSecundaria?: (typeof REUNIAO_INDICATOR_UNIDADES)[number] | null;
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
      nomeSecundario: params.nomeSecundario ?? null,
      unidadeSecundaria: params.unidadeSecundaria ?? null,
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
 * Card "Metas de [próximo mês]" de cada uma das 5 reuniões (`meetingKey` diz
 * de qual) — cadastro livre de metas para o mês seguinte (métrica, valor-alvo,
 * prêmio em R$, destinatário). Mecanismo único (model `MetaProximoMes`, ver
 * schema.prisma) compartilhado pelas 5 reuniões desde
 * 20260916023001_meta_proximo_mes_meeting_key — nasceu só do Gerente
 * (20260915181816_reuniao_gerente_metas_proximo_mes) e foi generalizado do
 * mesmo jeito que ReuniaoCustomIndicator generalizou. Mesmo padrão de
 * funções/comentários de load/create/find usado logo acima para os
 * indicadores.
 */

/**
 * Lista as metas de uma reunião específica (`meetingKey`) num período, na
 * ordem de cadastro (order, com createdAt como desempate) — cada uma com o
 * nome de quem cadastrou. Extraído aqui porque as 5 rotas GET
 * /api/reuniao/{sub}/metas-proximo-mes repetem exatamente essa consulta, só
 * trocando o `meetingKey`.
 */
export async function loadMetasProximoMes(empresaId: string, meetingKey: ReuniaoMeetingKeyDTO, periodo: string) {
  return prisma.metaProximoMes.findMany({
    where: { empresaId, meetingKey, periodo },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { createdBy: { select: { name: true } } },
  });
}

/**
 * Cria uma meta nova para uma reunião específica (`meetingKey`), sempre no
 * fim da lista daquele período+reunião (maior `order` + 1 entre as metas com
 * o mesmo `meetingKey`/`periodo`) — mesma lógica de
 * `createReuniaoCustomIndicator`. Extraído aqui porque as 5 rotas POST
 * /api/reuniao/{sub}/metas-proximo-mes repetem exatamente essa lógica; cada
 * rota só cuida da validação (período/métrica/valor-alvo) antes de chamar
 * isto.
 */
export async function createMetaProximoMes(params: {
  empresaId: string;
  meetingKey: ReuniaoMeetingKeyDTO;
  periodo: string;
  metrica: string;
  valorAlvo: string;
  valorPremio: number;
  destinatario: string;
  createdById: string;
}) {
  const maxOrder = await prisma.metaProximoMes.aggregate({
    where: { empresaId: params.empresaId, meetingKey: params.meetingKey, periodo: params.periodo },
    _max: { order: true },
  });

  return prisma.metaProximoMes.create({
    data: {
      empresaId: params.empresaId,
      meetingKey: params.meetingKey,
      periodo: params.periodo,
      metrica: params.metrica,
      valorAlvo: params.valorAlvo,
      valorPremio: params.valorPremio,
      destinatario: params.destinatario,
      order: (maxOrder._max.order ?? 0) + 1,
      createdById: params.createdById,
    },
    include: { createdBy: { select: { name: true } } },
  });
}

/**
 * Busca uma meta pelo id, mas só devolve algo se ela realmente for dessa
 * empresa E dessa reunião (`meetingKey`) — mesma dupla checagem de posse de
 * `findReuniaoCustomIndicatorForMeeting` acima, usada pelas rotas
 * PATCH/DELETE /api/reuniao/{sub}/metas-proximo-mes/{id}, pra uma rota de uma
 * reunião nunca conseguir editar/excluir a meta de outra (mesmo que alguém
 * descubra/adivinhe o id).
 */
export async function findMetaProximoMesForMeeting(id: string, empresaId: string, meetingKey: ReuniaoMeetingKeyDTO) {
  const meta = await prisma.metaProximoMes.findUnique({ where: { id } });
  if (!meta || meta.empresaId !== empresaId || meta.meetingKey !== meetingKey) return null;
  return meta;
}

export type MetaProximoMesUpdateInput = {
  periodo?: string;
  metrica?: string;
  valorAlvo?: string;
  valorPremio?: number;
  destinatario?: string;
  order?: number;
};

/**
 * Atualiza os campos enviados (todos opcionais) de uma meta já criada. A
 * rota chamadora já validou o payload e confirmou a posse (mesma empresa +
 * mesma reunião) via `findMetaProximoMesForMeeting` antes de chamar isto —
 * este helper é um repasse direto ao Prisma, extraído aqui só por simetria
 * com o resto do módulo (load/create/find já centralizados acima).
 */
export async function updateMetaProximoMes(id: string, data: MetaProximoMesUpdateInput) {
  return prisma.metaProximoMes.update({ where: { id }, data });
}

/**
 * Exclui uma meta já criada. Mesma observação de `updateMetaProximoMes`: a
 * posse já foi confirmada pela rota chamadora antes de chamar isto.
 */
export async function deleteMetaProximoMes(id: string): Promise<void> {
  await prisma.metaProximoMes.delete({ where: { id } });
}
