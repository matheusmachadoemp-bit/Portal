import { prisma } from "@/lib/prisma";
import { breakdownMovimentacoesNoPeriodo, cmvRealValor, snapshotEstoqueEm, valorEstoqueDeSnapshot } from "@/lib/cmv";
import { safeDiv } from "@/lib/calc";
import { periodoRange } from "@/lib/reuniao";

/**
 * CMV real (%) e desperdício (R$) do mês, calculados a partir do Estoque
 * (StockMovement) e Perdas (Loss) já existentes — sem precisar digitar nada.
 */
export async function computeCozinhaMetrics(empresaId: string, periodo: string) {
  const { start, end } = periodoRange(periodo);

  const [ingredients, snapshotInicial, snapshotFinal, movementsNoPeriodo, salesEntries, losses] = await Promise.all([
    prisma.ingredient.findMany({ where: { empresaId } }),
    snapshotEstoqueEm(prisma, [empresaId], start),
    snapshotEstoqueEm(prisma, [empresaId], end),
    // breakdownMovimentacoesNoPeriodo só soma o que cai dentro de [start, end]
    // (mesmo filtro que ela já aplicava em JS) — trazer só essa janela do
    // banco não muda o resultado, só evita carregar o histórico inteiro.
    prisma.stockMovement.findMany({ where: { empresaId, createdAt: { gte: start, lte: end } }, orderBy: { createdAt: "desc" } }),
    prisma.salesEntry.findMany({ where: { empresaId, date: { gte: start, lt: end } } }),
    prisma.loss.aggregate({ where: { empresaId, data: { gte: start, lt: end } }, _sum: { valorEstimado: true } }),
  ]);

  const estoqueInicial = valorEstoqueDeSnapshot(ingredients, snapshotInicial);
  const estoqueFinal = valorEstoqueDeSnapshot(ingredients, snapshotFinal);
  const breakdown = breakdownMovimentacoesNoPeriodo(ingredients, movementsNoPeriodo, start, end);
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
 * calculados a partir do módulo Satisfação do Cliente
 * (CustomerSurveyResponse) e Vendas (SalesEntry) já existentes — sem
 * precisar digitar nada.
 *
 * Migrado de `NpsResponse` pra `CustomerSurveyResponse.notaGeral` (achado da
 * Nina revisando a migração da Tela de Início/CRM dashboard: este era um 3º
 * lugar, num módulo diferente — Reuniões —, que ainda lia do modelo antigo.
 * Mesmo padrão de `loadNpsScore`, em src/lib/inicio.ts: escala 0-10 igual,
 * sem conversão, só trocando `nota`/`createdAt` por
 * `notaGeral`/`submittedAt`. `POST /api/crm/nps` (única forma de criar
 * `NpsResponse`) não tem nenhum caller em nenhuma tela do repo — este
 * indicador já não recebia dado novo, pré-preenchendo o formulário mensal
 * "Reunião de Salão" com `npsPercent: null` silenciosamente.
 */
export async function computeSalaoMetrics(empresaId: string, periodo: string) {
  const { start, end } = periodoRange(periodo);

  const [respostas, salesEntries] = await Promise.all([
    prisma.customerSurveyResponse.findMany({
      where: { empresaId, submittedAt: { gte: start, lt: end } },
      select: { notaGeral: true },
    }),
    prisma.salesEntry.findMany({
      where: { empresaId, date: { gte: start, lt: end } },
      select: { faturamentoSalao: true, pedidosSalao: true },
    }),
  ]);

  const promotores = respostas.filter((r) => r.notaGeral >= 9).length;
  const detratores = respostas.filter((r) => r.notaGeral <= 6).length;
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
 * Comentários de clientes em destaque (notas altas, com texto) no período —
 * puxados automaticamente do módulo Satisfação do Cliente
 * (CustomerSurveyResponse) já existente.
 *
 * Migrado de `NpsResponse` pra `CustomerSurveyResponse` (ver comentário de
 * `computeSalaoMetrics`, acima, sobre o achado da Nina). `nota`/`comentario`
 * viram `notaGeral`/`sugestao` — `sugestao` é o campo de texto livre e
 * opcional do último passo do formulário público ("Quer deixar alguma
 * sugestão?", ver src/app/avaliar/[token]/avaliar-client.tsx), pedido pra
 * qualquer nota, não só uma pergunta específica de nota baixa — o
 * equivalente direto do antigo `NpsResponse.comentario`. `nome` vem de
 * `nomeInformado` (a cópia própria do nome digitado na pesquisa, sempre
 * preenchida — ver comentário do model `CustomerSurveyResponse` em
 * schema.prisma), não de `cliente?.nome`: diferente de `NpsResponse`, aqui
 * não existe um fallback "Cliente" porque `nomeInformado` nunca é nulo.
 */
export async function computeComentariosDestaque(empresaId: string, periodo: string, take = 5) {
  const { start, end } = periodoRange(periodo);

  const respostas = await prisma.customerSurveyResponse.findMany({
    where: { empresaId, submittedAt: { gte: start, lt: end }, notaGeral: { gte: 9 }, sugestao: { not: null } },
    orderBy: { notaGeral: "desc" },
    take,
    select: { sugestao: true, notaGeral: true, nomeInformado: true },
  });

  return respostas
    .filter((r) => r.sugestao && r.sugestao.trim())
    .map((r) => ({ nome: r.nomeInformado, comentario: r.sugestao as string, nota: r.notaGeral }));
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

export type ReuniaoMeetingKeyDTO = "GERENTE" | "SALAO" | "COZINHA" | "DELIVERY" | "LIDERANCA";

export type ReuniaoCustomIndicatorDTO = {
  id: string;
  nome: string;
  /**
   * O `periodo` ("YYYY-MM") MAIS ANTIGO que tem um `ReuniaoCustomIndicatorValue`
   * de verdade salvo para este indicador — `null` quando o indicador nunca
   * recebeu nenhum valor em período nenhum (ex.: acabou de ser criado).
   *
   * NÃO usar `ReuniaoCustomIndicator.createdAt` pra essa finalidade — tentativa
   * anterior (ver histórico desta mesma tarefa) usava `createdAt`, mas os 4
   * indicadores fixos migrados de campos antigos (Faturamento Total/CMV/
   * Turnover/Checklist Operacional do Gerente, NPS/Faturamento/Ticket Médio do
   * Salão, etc. — ver `20260914140000_gerente_fechamento_do_mes` e
   * `20260914160000_salao_cozinha_delivery_fechamento_do_mes`) têm `createdAt`
   * = data em que a migration rodou (bem recente), MESMO tendo meses de
   * `ReuniaoCustomIndicatorValue` reais copiados pra trás nessa mesma
   * migration ("preservando histórico") — usar `createdAt` apagava com `null`
   * o histórico real desses indicadores de uso diário, um bug pior que o
   * original. `primeiroPeriodoComValor` reflete o dado de verdade (quando
   * existe o PRIMEIRO valor salvo), não quando a linha do indicador foi
   * criada.
   *
   * Usado para diferenciar "o indicador ainda não existia (nenhum valor
   * salvo ainda) neste período" de "existe mas sem valor salvo NESTE período
   * específico, com valor salvo em outros" (cai no `valorPadrao`, mesmo
   * comportamento de sempre) — ver `historicoFor` em
   * `buildCustomIndicatorPdfEntries` (fechamento-do-mes.tsx).
   */
  primeiroPeriodoComValor: string | null;
  icon: string;
  unidade: "PERCENT" | "CURRENCY" | "NUMBER";
  valorPadrao: number;
  valor: number | null;
  valorReferencia: number;
  /**
   * `true` quando já existe um `ReuniaoCustomIndicatorValue` de verdade salvo
   * para este indicador NESTE período específico (`periodo`, o mesmo
   * parâmetro de `loadReuniaoCustomIndicators`) — `false` quando este
   * período cai num "buraco" (indicador usado antes e depois, mas sem valor
   * salvo exatamente aqui) OU quando o indicador nunca recebeu valor nenhum.
   * Non-null/non-undefined sempre que vem de `loadReuniaoCustomIndicators`
   * de verdade (`?:` só por causa da construção manual client-side em
   * `fechamento-do-mes.tsx`, ver comentário de `nomeSecundario` abaixo).
   *
   * Sinal CONFIÁVEL de "tem valor cadastrado neste período" — ao contrário
   * de `valor` (acima), que está morto (nada grava um `valor` não-null desde
   * que a antiga seção "Resultado do período" foi removida da tela — nem
   * `buildIndicatorsPayload()`/o submit do Gerente mandam um `valor` de
   * verdade no POST, nem o backfill de `primeiroPeriodoComValor`/migrations
   * gravou algo ali, ver 20260914140000_gerente_fechamento_do_mes e
   * 20260914160000_salao_cozinha_delivery_fechamento_do_mes: sempre NULL,
   * mesmo para o histórico real copiado "pra trás") e diferente de só usar
   * `primeiroPeriodoComValor` (não cobre um "buraco" no meio do intervalo
   * ativo — indicador usado em julho e setembro mas sem valor em agosto
   * especificamente ainda cairia no valorPadrao fabricado se só olhasse
   * `periodo >= primeiroPeriodoComValor`). Usado por
   * `buildCustomIndicatorPdfEntries` (fechamento-do-mes.tsx) para decidir se
   * mostra o valor real do período no PDF ou omite a linha/mostra "-" —
   * nunca fabricar um valor a partir do valorPadrao como se fosse cadastrado.
   */
  cadastradoNoPeriodo?: boolean;
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
  /**
   * Terceiro valor (opcional) de um indicador composto — mesma ideia de
   * `nomeSecundario`/`unidadeSecundaria`/`valorSecundario` acima, mas só pode
   * existir quando o indicador JÁ tem um segundo valor (ver comentário de
   * `nomeTerciario` em schema.prisma) — nunca preenchido com o segundo valor
   * em `null`. `null` nos 3 campos abaixo = sem terceiro valor (indicador
   * simples ou composto de 2 valores só), igual todo indicador até esta
   * migration.
   */
  nomeTerciario?: string | null;
  unidadeTerciaria?: "PERCENT" | "CURRENCY" | "NUMBER" | null;
  valorTerciario?: number | null;
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

  const indicatorIds = indicators.map((i) => i.id);
  const [values, earliestByIndicator] = await Promise.all([
    prisma.reuniaoCustomIndicatorValue.findMany({
      where: { indicatorId: { in: indicatorIds }, periodo },
    }),
    // Período mais antigo com um valor de verdade salvo, por indicador — busca
    // em TODOS os períodos (sem filtrar por `periodo`, diferente da query
    // acima), pra servir de "desde quando este indicador tem dado real" (ver
    // comentário de `primeiroPeriodoComValor` no tipo `ReuniaoCustomIndicatorDTO`
    // acima, sobre por que isso não pode vir de `createdAt`). Comparação
    // lexicográfica de strings "YYYY-MM" (MIN de texto no Postgres) é
    // cronológica porque todo `periodo` tem exatamente o mesmo formato de 7
    // caracteres.
    prisma.reuniaoCustomIndicatorValue.groupBy({
      by: ["indicatorId"],
      where: { indicatorId: { in: indicatorIds } },
      _min: { periodo: true },
    }),
  ]);
  const valueByIndicator = new Map(values.map((v) => [v.indicatorId, v]));
  const earliestPeriodoMap = new Map(earliestByIndicator.map((e) => [e.indicatorId, e._min.periodo ?? null]));

  return indicators.map((ind) => {
    const v = valueByIndicator.get(ind.id);
    // ANTES de qualquer `??`/fallback abaixo: `v` só é `undefined` quando a
    // query de `values` (que já filtra por `periodo`, acima) não achou
    // nenhuma linha de ReuniaoCustomIndicatorValue pra este indicador NESTE
    // período exato — exatamente o sinal que `cadastradoNoPeriodo` expõe
    // (ver comentário do campo no tipo `ReuniaoCustomIndicatorDTO`).
    const cadastradoNoPeriodo = v !== undefined;
    return {
      id: ind.id,
      nome: ind.nome,
      primeiroPeriodoComValor: earliestPeriodoMap.get(ind.id) ?? null,
      icon: ind.icon,
      unidade: ind.unidade,
      valorPadrao: ind.valorPadrao,
      valor: v?.valor ?? null,
      valorReferencia: v?.valorReferencia ?? ind.valorPadrao,
      cadastradoNoPeriodo,
      nomeSecundario: ind.nomeSecundario,
      unidadeSecundaria: ind.unidadeSecundaria,
      // Sem fallback pra valorPadrao (não existe "valorPadraoSecundario" — ver
      // comentário de ReuniaoCustomIndicatorValue.valorSecundario em
      // schema.prisma): fica null até alguém salvar um valor de verdade pro
      // período, mesmo quando o indicador já tem unidadeSecundaria configurada.
      valorSecundario: v?.valorSecundario ?? null,
      nomeTerciario: ind.nomeTerciario,
      unidadeTerciaria: ind.unidadeTerciaria,
      // Mesma regra de valorSecundario acima — null até alguém salvar um valor
      // de verdade pro período.
      valorTerciario: v?.valorTerciario ?? null,
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
  /** Só é gravado de fato quando o indicador tem `unidadeTerciaria`
   * configurada — ver `upsertReuniaoCustomIndicatorValues` abaixo. */
  valorTerciario?: string | number;
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
        // Mesma regra de valorSecundario acima, agora pro terceiro valor — só
        // grava valorTerciario quando o indicador tem unidadeTerciaria
        // configurada (que por sua vez só existe quando unidadeSecundaria
        // também existe — ver comentário de nomeTerciario em schema.prisma),
        // nunca a partir só do que o payload mandar.
        const valorTerciario =
          indicator.unidadeTerciaria && c.valorTerciario !== undefined && c.valorTerciario !== ""
            ? Number(c.valorTerciario)
            : null;
        return prisma.reuniaoCustomIndicatorValue.upsert({
          where: { indicatorId_periodo: { indicatorId: c.id, periodo } },
          update: { valor, valorReferencia, valorSecundario, valorTerciario },
          create: { indicatorId: c.id, periodo, valor, valorReferencia, valorSecundario, valorTerciario },
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

/** Resultado de `parseTertiaryIndicatorFields` — mesma forma de `SecondaryIndicatorFieldsResult`,
 * ver comentário dela para o significado de cada variante (`touched`/`ok`). */
export type TertiaryIndicatorFieldsResult =
  | { touched: false }
  | { touched: true; ok: true; nomeTerciario: string | null; unidadeTerciaria: (typeof REUNIAO_INDICATOR_UNIDADES)[number] | null }
  | { touched: true; ok: false; error: string };

/**
 * Valida o par `nomeTerciario`/`unidadeTerciaria` vindo do body de criar/editar
 * um indicador — mesma lógica de `parseSecondaryIndicatorFields` acima, agora
 * pro terceiro valor (ex.: "Pedidos por canal" com um terceiro número além do
 * principal e do segundo). Não checa aqui a dependência "só pode ter 3º valor
 * se já tiver o 2º" — isso cruza informação dos 2 pares (e, na edição, também
 * do indicador já salvo) e por isso é responsabilidade de
 * `validateTertiaryRequiresSecondary`, chamada separadamente pela rota depois
 * de resolver os dois pares.
 */
export function parseTertiaryIndicatorFields(body: {
  nomeTerciario?: unknown;
  unidadeTerciaria?: unknown;
}): TertiaryIndicatorFieldsResult {
  const nomeProvided = body.nomeTerciario !== undefined;
  const unidadeProvided = body.unidadeTerciaria !== undefined;
  if (!nomeProvided && !unidadeProvided) return { touched: false };

  const nome = typeof body.nomeTerciario === "string" ? body.nomeTerciario.trim() : "";
  const unidade = body.unidadeTerciaria;
  const hasNome = nome !== "";
  const hasUnidade = unidade !== undefined && unidade !== null && unidade !== "";

  if (!hasNome && !hasUnidade) return { touched: true, ok: true, nomeTerciario: null, unidadeTerciaria: null };
  if (hasNome !== hasUnidade) {
    return {
      touched: true,
      ok: false,
      error:
        "Para um indicador com 3 valores, informe o nome e a unidade do terceiro valor juntos (ou deixe os dois em branco para um indicador com 1 ou 2 valores).",
    };
  }
  if (!REUNIAO_INDICATOR_UNIDADES.includes(unidade as (typeof REUNIAO_INDICATOR_UNIDADES)[number])) {
    return { touched: true, ok: false, error: "Unidade do terceiro valor inválida." };
  }
  return {
    touched: true,
    ok: true,
    nomeTerciario: nome,
    unidadeTerciaria: unidade as (typeof REUNIAO_INDICATOR_UNIDADES)[number],
  };
}

/**
 * Confere a regra "só pode ter um terceiro valor se também tiver o segundo"
 * (ver comentário de `nomeTerciario` em schema.prisma) — chamada pelas 10
 * rotas de criar/editar indicador depois de resolver tanto
 * `parseSecondaryIndicatorFields` quanto `parseTertiaryIndicatorFields`; esta
 * função só cruza os dois resultados JÁ RESOLVIDOS pro estado FINAL (depois
 * desta operação), não o resultado "cru" de cada parse — importante na
 * edição: se o body desmarca o segundo valor mas nem toca no terceiro (que o
 * indicador já tinha configurado), o estado final ainda ficaria inconsistente
 * (3º valor "sobrevivendo" sem o 2º) se a checagem olhasse só pra o que foi
 * tocado nesta requisição; por isso a chamadora sempre resolve o estado FINAL
 * de cada um antes de chamar esta função (ver comentário de uso nas rotas).
 *
 * `efetivoTemSecundario`/`efetivoTemTerciario`: true quando o indicador VAI
 * TER o 2º/3º valor depois desta operação — na criação, é direto o que o
 * body está pedindo agora (`secondary.ok && secondary.unidadeSecundaria !==
 * null`, mesma coisa pro terciário); na edição, quando o campo correspondente
 * não foi tocado (`touched: false`), é o que o indicador já tinha antes
 * (`!!indicatorAtual.unidadeSecundaria`/`unidadeTerciaria`), igual ao
 * raciocínio de "campo não tocado mantém o que já estava salvo" usado pelos
 * outros campos do PATCH.
 *
 * Devolve uma mensagem de erro (pra responder 400) quando o estado final
 * ficaria com um terceiro valor sem o segundo, ou `null` quando está tudo
 * consistente.
 */
export function validateTertiaryRequiresSecondary(efetivoTemSecundario: boolean, efetivoTemTerciario: boolean): string | null {
  if (efetivoTemTerciario && !efetivoTemSecundario) {
    return 'Para ter um terceiro valor, o indicador precisa ter o segundo valor também (marque "Este indicador tem um segundo valor" primeiro).';
  }
  return null;
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
 * um indicador simples, como todo indicador criado até hoje. Mesma ideia para
 * `nomeTerciario`/`unidadeTerciaria` (ver `parseTertiaryIndicatorFields` e
 * `validateTertiaryRequiresSecondary` — a chamadora já confirmou a
 * dependência do 3º valor no 2º antes de chegar aqui, esta função não repete
 * essa checagem).
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
  nomeTerciario?: string | null;
  unidadeTerciaria?: (typeof REUNIAO_INDICATOR_UNIDADES)[number] | null;
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
      nomeTerciario: params.nomeTerciario ?? null,
      unidadeTerciaria: params.unidadeTerciaria ?? null,
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
