import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type TxClient = Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Prêmio-sentinela "Tente novamente"
//
// `RouletteSpin.prizeId` é obrigatório no schema (nunca `String?`) — então mesmo o resultado
// "sem prêmio real" (`codigo: null`, ver comentário em `RouletteSpin.codigo` no schema) precisa
// apontar para uma linha de `RoulettePrize` de verdade, senão a constraint de chave estrangeira
// rejeita o INSERT. Em vez de um campo novo (`isTenteNovamente Boolean`, que exigiria migration —
// fora de escopo desta fase, ver o pedido do líder), cada loja ganha UMA linha reservada, criada
// sob demanda (mesmo idioma de `ensureFixedNotaGeralQuestion`,
// src/lib/customer-survey-server.ts) com um id PREVISÍVEL (não o `cuid()` default) — assim ela é
// sempre localizável por `findUnique` na própria chave primária, sem depender de nome/ícone
// (textos que, em teoria, um prêmio de verdade poderia reaproveitar) e sem precisar de uma coluna
// boolean nova.
//
// Esta linha NUNCA aparece no CRUD admin (todas as rotas de `roleta/premios` a excluem
// explicitamente por id, ver `adminPrizeWhereExcludingSentinela`) e sua `probabilidadePercent` armazenada
// nunca é lida por ninguém — a fatia de "Tente novamente" é sempre recalculada em tempo real, no
// momento do giro, como `100 - soma dos prêmios reais elegíveis` (ver `sortearPremio`), nunca um
// valor configurado à parte.
// ---------------------------------------------------------------------------

export function tenteNovamentePrizeId(empresaId: string): string {
  return `roulette-tente-novamente:${empresaId}`;
}

/** Garante que a linha-sentinela desta loja existe, criando na primeira vez que for preciso
 *  (lazy bootstrap). Sempre chamada DENTRO da transação do giro (`executarGiro`) — se a criação
 *  colidir (P2002 na PK, duas transações concorrentes tentando criar a sentinela desta loja pela
 *  primeira vez ao mesmo tempo), o erro é deixado subir sem ser capturado aqui de propósito: é a
 *  ÚLTIMA regra de segurança contra "continuar usando uma transação com uma instrução que falhou"
 *  (ver nota grande em `executarGiro`) — quem trata isso é o retry externo de `girarRoleta`.
 */
async function ensureTenteNovamentePrize(tx: TxClient, empresaId: string) {
  const id = tenteNovamentePrizeId(empresaId);
  const existing = await tx.roulettePrize.findUnique({ where: { id } });
  if (existing) return existing;
  return tx.roulettePrize.create({
    data: {
      id,
      empresaId,
      nome: "Tente novamente",
      descricao: null,
      // Nunca lido — ver nota acima do bloco. Fica em 0 só porque a coluna é NOT NULL.
      probabilidadePercent: 0,
      quantidadeDisponivel: null,
      validadeDias: 0,
      ativo: true,
      ordem: -1,
    },
  });
}

// ---------------------------------------------------------------------------
// CRUD admin (RoulettePrize) — validação de probabilidade
// ---------------------------------------------------------------------------

/** Tolerância de ponto flutuante para comparações de soma de probabilidade (evita rejeitar
 *  99.999999999% por erro de arredondamento de `Float`). */
const PROBABILIDADE_EPSILON = 1e-6;
const PROBABILIDADE_MAX = 100;

/**
 * Soma de `probabilidadePercent` dos prêmios ATIVOS de uma loja, sempre excluindo a
 * sentinela "Tente novamente" (nunca é um prêmio "de verdade", ver bloco acima) e,
 * quando informado (edição), excluindo também `excludeId` — o próprio prêmio sendo editado,
 * pra somar contra o RESTANTE do catálogo antes de decidir se o valor novo cabe.
 */
export async function somaProbabilidadeAtivos(empresaId: string, excludeId?: string): Promise<number> {
  const excludeIds = [tenteNovamentePrizeId(empresaId), ...(excludeId ? [excludeId] : [])];
  const agg = await prisma.roulettePrize.aggregate({
    where: { empresaId, ativo: true, id: { notIn: excludeIds } },
    _sum: { probabilidadePercent: true },
  });
  return agg._sum.probabilidadePercent ?? 0;
}

/**
 * Decide se `novoPercent` cabe no orçamento de probabilidade da loja (soma dos ATIVOS <= 100).
 *
 * Decisão de negócio (documentada aqui pois o comentário do schema só diz "validado na API: soma
 * dos ativos de uma empresa = 100", sem esclarecer se é uma igualdade estrita ou um teto):
 * a soma dos prêmios ativos pode ficar EM ATÉ 100, não precisa fechar EXATAMENTE 100 sempre.
 * Quando sobra folga (ex.: só 60% distribuído entre prêmios reais), os 40% restantes viram,
 * automaticamente, a chance de "Tente novamente" no sorteio (ver `sortearPremio`) — não existe
 * (nem é preciso) um prêmio "Tente novamente" configurável pelo admin para representar essa
 * fatia. Se a soma ultrapassar 100, aí sim é erro: não há como sortear com pesos que somam mais
 * que o total.
 *
 * Devolve `null` quando é válido, ou uma mensagem de erro pronta pra devolver ao cliente da API.
 */
export async function validarProbabilidadeAtiva(
  empresaId: string,
  novoPercent: number,
  excludeId?: string
): Promise<string | null> {
  if (!Number.isFinite(novoPercent) || novoPercent < 0 || novoPercent > PROBABILIDADE_MAX) {
    return "A probabilidade deve ser um número entre 0 e 100.";
  }
  const somaOutros = await somaProbabilidadeAtivos(empresaId, excludeId);
  const total = somaOutros + novoPercent;
  if (total > PROBABILIDADE_MAX + PROBABILIDADE_EPSILON) {
    const restante = Math.max(0, PROBABILIDADE_MAX - somaOutros);
    return `A soma das probabilidades dos prêmios ativos não pode passar de 100%. Os outros prêmios ativos desta loja já somam ${somaOutros.toFixed(2)}% — este prêmio pode usar no máximo ${restante.toFixed(2)}%.`;
  }
  return null;
}

/** Todo `where` de listagem/edição do CRUD admin de prêmios precisa excluir a sentinela — nunca
 *  deve aparecer na tela (nem ser editável, nem contar em nenhuma listagem administrativa). */
export function adminPrizeWhereExcludingSentinela(empresaId: string): Prisma.RoulettePrizeWhereInput {
  return { empresaId, id: { not: tenteNovamentePrizeId(empresaId) } };
}

// ---------------------------------------------------------------------------
// Sorteio ponderado — puro (sem I/O), testável isoladamente
// ---------------------------------------------------------------------------

export type CandidatoSorteio = { id: string; probabilidadePercent: number };

/**
 * Sorteio ponderado por `probabilidadePercent`. Recebe só os candidatos JÁ FILTRADOS (ativos e
 * com estoque — ver `executarGiro`) e devolve o id do prêmio sorteado, ou `null` para "Tente
 * novamente".
 *
 * A fatia de "Tente novamente" nunca é um peso explícito nesta lista — é sempre o que sobra até
 * 100 depois de somar os pesos dos candidatos (`100 - soma(candidatos)`), incluindo o caso de a
 * lista vir vazia (loja sem nenhum prêmio ativo/em estoque: sempre "Tente novamente"). Se a soma
 * dos candidatos já bater 100 (ou passar por causa de arredondamento de ponto flutuante), o `roll`
 * (sempre em `[0, 100)`) nunca sobra pra fatia de "Tente novamente" — o `for` sempre encontra um
 * candidato antes de acabar.
 *
 * Usa `Math.random()` (não `crypto.randomBytes`) de propósito: aqui é só o resultado do sorteio
 * em si (probabilidade configurada pelo admin), não um segredo/token que precise resistir a
 * previsão por um atacante — bem diferente da geração de `codigo` (`gerarCodigoCandidato` abaixo),
 * que usa CSPRNG porque um código previsível seria uma forma de fraude (adivinhar/forjar o
 * resultado do próprio giro).
 */
export function sortearPremio(candidatos: CandidatoSorteio[]): string | null {
  const roll = Math.random() * 100; // [0, 100)
  let acumulado = 0;
  for (const candidato of candidatos) {
    acumulado += candidato.probabilidadePercent;
    if (roll < acumulado) return candidato.id;
  }
  return null; // roll caiu na fatia restante (>= soma dos candidatos) => "Tente novamente".
}

// ---------------------------------------------------------------------------
// Código único do prêmio (RouletteSpin.codigo)
// ---------------------------------------------------------------------------

/**
 * Código alfanumérico (6 bytes = 12 chars hex maiúsculas) exibido ao cliente pra resgatar o
 * prêmio na loja (Fase 7). Mesmo formato de `generateCertificateCode`
 * (src/lib/university-server.ts), mas gerado com CSPRNG (`crypto.randomBytes`) igual a ela — a
 * diferença é que a colisão É tratada de verdade aqui (ver `executarGiro`/`girarRoleta`: o
 * `create` de `RouletteSpin` é a única fonte de verdade sobre unicidade — a constraint `@unique`
 * do banco —, e uma colisão nela faz o giro inteiro ser tentado de novo, nunca é ignorada
 * silenciosamente). A função irmã (`generateCertificateCode`) não tem esse retry — achado já
 * registrado na investigação original da Fase 1, fora de escopo consertar ela aqui.
 */
export function gerarCodigoCandidato(): string {
  return randomBytes(6).toString("hex").toUpperCase();
}

// ---------------------------------------------------------------------------
// Regra anti-fraude (RouletteEligibility) + giro completo
// ---------------------------------------------------------------------------

const GIRO_RATE_LIMIT_DIAS_PADRAO = 30; // mesmo default do schema (CustomerSurveyConfig.giroRoletaIntervaloDias).

/**
 * Descobre se um P2002 se refere a uma constraint cujo nome contém `needle` (ex.: "telefone",
 * "responseId") — ou `undefined` se não for possível determinar.
 *
 * Achado ao vivo nesta tarefa: nesta versão do Prisma (7.10) com driver adapter
 * (`@prisma/adapter-pg`, ver src/lib/prisma.ts), `PrismaClientKnownRequestError.meta.target`
 * (o formato "clássico", usado pelos helpers irmãos `isNumeroConflict`/`isFixaNotaGeralConflict`
 * em outras rotas deste módulo) vem **`undefined`** — o detalhe do conflito aparece só em
 * `meta.driverAdapterError.cause.constraint.index` (o nome do índice Postgres, ex.
 * `"RouletteSpin_responseId_key"`) e, como reforço, em `cause.originalMessage` (a mensagem crua
 * do Postgres, que também cita o nome da constraint). Os helpers irmãos não quebraram com essa
 * mudança só por sorte: os dois têm fallback `?? true` (tratam qualquer P2002 como sendo aquela
 * constraint específica quando não conseguem confirmar), o que é seguro PRA ELES porque cada
 * `create` que eles protegem só tem UMA constraint única possível. Aqui, checar os dois formatos
 * (`target` E `driverAdapterError`) deixa a função funcionando nos dois shapes possíveis, em vez
 * de depender de qual delas o ambiente de fato usa.
 */
function p2002ConstraintIncludes(e: unknown, needle: string): boolean | undefined {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") return undefined;
  const meta = e.meta as
    | { target?: string[]; driverAdapterError?: { cause?: { constraint?: { index?: string }; originalMessage?: string } } }
    | undefined;
  if (meta?.target) return meta.target.some((t) => t.includes(needle));
  const index = meta?.driverAdapterError?.cause?.constraint?.index;
  if (index) return index.includes(needle);
  const message = meta?.driverAdapterError?.cause?.originalMessage;
  if (message) return message.includes(needle);
  return undefined;
}

/** `RouletteEligibility` só tem a constraint composta `[empresaId, telefone]` — qualquer P2002
 *  nesta chamada específica (`tx.rouletteEligibility.create`, o único INSERT deste model em todo
 *  o arquivo) só pode ser essa, então o fallback é `true` quando não dá pra confirmar (mesmo
 *  raciocínio de `isFixaNotaGeralConflict`, src/lib/customer-survey-server.ts). */
function isEligibilityConflict(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && (p2002ConstraintIncludes(e, "telefone") ?? true);
}

/** P2002 no `responseId` de `RouletteSpin` — significa que outra requisição concorrente (ex.:
 *  duplo clique) já girou pra esta mesma avaliação entre o SELECT de checagem e o INSERT. Sempre
 *  a ÚLTIMA operação da transação quando acontece (ver `executarGiro`), então é seguro deixar
 *  subir sem tentar mais nada na mesma `tx`.
 *
 * Ao contrário de `isEligibilityConflict`, aqui o fallback quando não dá pra confirmar é `false`
 * (nunca `true`): `RouletteSpin` tem DUAS constraints únicas (`responseId` e `codigo`), então um
 * P2002 ambíguo poderia ser qualquer uma das duas — tratar como "já girou" por padrão devolveria
 * uma mensagem enganosa pro cliente numa colisão de código; o padrão seguro é deixar subir pro
 * retry de `girarRoleta` (que trata qualquer P2002 não identificado como transiente/retryable).
 */
function isResponseJaGirouConflict(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && (p2002ConstraintIncludes(e, "responseId") ?? false);
}

/**
 * Trava (advisory lock do Postgres, com escopo da própria transação — liberado sozinho no
 * commit/rollback) a concorrência de giro de UMA `responseId` — mesmo padrão de
 * `travarSaldoLojaNord` (src/lib/loja-nord-server.ts).
 *
 * Existe pra resolver uma corrida específica encontrada AO VIVO no teste de carga desta tarefa:
 * sem esta trava, dois giros simultâneos pra EXATAMENTE a mesma `responseId` (duplo clique/
 * duplo submit) disputam a reserva de elegibilidade (`RouletteEligibility`, por telefone) ANTES
 * de qualquer um checar se a avaliação já tem giro — como os dois giros compartilham o MESMO
 * telefone (é a mesma avaliação), o perdedor daquela corrida recebia a mensagem de anti-fraude
 * ("já girou recentemente, tente em outra visita") em vez da mensagem correta e mais específica
 * ("você já girou a roleta PARA ESTA AVALIAÇÃO") — resultado funcionalmente seguro (nunca saem 2
 * prêmios), mas com um texto de erro impreciso/confuso pro cliente final. Travando por
 * `responseId` como a PRIMEIRA coisa que a transação faz, o segundo giro concorrente espera o
 * primeiro terminar (commit ou rollback) antes de sequer checar se já existe `RouletteSpin` pra
 * esta `responseId` — a checagem logo abaixo (`tx.rouletteSpin.findUnique`) passa a ser
 * confiável (sem essa trava, dois SELECTs concorrentes podiam os dois verem "ainda não existe" e
 * seguir em frente, sobrando pra constraint `@unique` do banco decidir só lá na hora do INSERT,
 * que é exatamente o cenário ambíguo que gerava a mensagem errada).
 */
async function travarGiroPorResponse(tx: TxClient, responseId: string): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('roulette_giro_response'), hashtext(${responseId}))::text`;
}

export type ResultadoGiro =
  | {
      ok: true;
      resultado: "premio";
      codigo: string;
      validadeAte: Date;
      premio: { id: string; nome: string; descricao: string | null; imagemUrl: string | null; icone: string | null };
    }
  | { ok: true; resultado: "tente_novamente" }
  | { ok: false; error: string };

/**
 * Corpo da transação do giro — chamada de dentro de `prisma.$transaction` por `girarRoleta`.
 *
 * *** Nota de segurança sobre transações interativas do Prisma/Postgres ***
 * Quando UMA instrução SQL falha dentro de uma transação (ex.: violação de constraint `@unique`),
 * o Postgres marca a transação inteira como "abortada" no servidor — qualquer instrução seguinte
 * na MESMA transação falha também (`current transaction is aborted`), mesmo que o erro da
 * primeira tenha sido capturado (`try/catch`) no lado do JavaScript. Ou seja: capturar o erro em
 * código não "limpa" a transação — só evita que a EXCEÇÃO se propague, o banco continua rejeitando
 * tudo até um ROLLBACK. Por isso, neste arquivo, todo `try/catch` em volta de uma escrita que pode
 * colidir (`RouletteEligibility.create` abaixo) só é usado quando NENHUMA outra operação na mesma
 * `tx` é tentada depois dele além de, no máximo, um `throw` (que aciona o ROLLBACK de verdade,
 * sempre seguro de emitir). Qualquer outra colisão possível nesta função (código duplicado,
 * corrida na criação da sentinela "Tente novamente") é deixada subir SEM catch local — quem trata
 * é o retry de `girarRoleta`, que abre uma transação nova do zero a cada tentativa.
 */
async function executarGiro(
  tx: TxClient,
  response: { id: string; empresaId: string; telefoneInformado: string; clienteId: string | null },
  intervaloDias: number
): Promise<ResultadoGiro> {
  const empresaId = response.empresaId;
  const telefone = response.telefoneInformado;
  const now = new Date();

  // 0) Trava a concorrência desta `responseId` específica (ver `travarGiroPorResponse`) ANTES de
  //    tocar em qualquer outra coisa — garante que a checagem "já girou?" logo abaixo é confiável
  //    mesmo sob 2 chamadas simultâneas pra exata mesma avaliação (duplo clique/duplo submit).
  await travarGiroPorResponse(tx, response.id);
  const spinExistente = await tx.rouletteSpin.findUnique({ where: { responseId: response.id }, select: { id: true } });
  if (spinExistente) throw new Error("JA_GIROU");

  // 1) Regra anti-fraude: "1 giro por telefone a cada X dias" (RouletteEligibility) ------------
  const cutoff = new Date(now.getTime() - intervaloDias * 24 * 60 * 60 * 1000);

  // Primeiro tenta resetar uma linha existente e JÁ elegível (ultimoGiroEm antes do corte) —
  // update condicional atômico, mesmo padrão de `checkRateLimit` (src/lib/rate-limit.ts): nunca
  // "lê, decide no código, grava depois". `count > 0` já É a confirmação atômica de elegibilidade
  // — nenhuma outra requisição concorrente consegue "ganhar" a mesma linha ao mesmo tempo, porque
  // o UPDATE trava a linha no Postgres até commitar.
  const updated = await tx.rouletteEligibility.updateMany({
    where: { empresaId, telefone, ultimoGiroEm: { lt: cutoff } },
    data: { ultimoGiroEm: now },
  });

  let elegivel = updated.count > 0;
  if (!elegivel) {
    // `updateMany` não achou linha elegível — ou o telefone nunca girou (linha não existe) ou já
    // girou dentro da janela (linha existe, mas `ultimoGiroEm` não é anterior ao corte). `create`
    // resolve os dois casos de uma vez: só funciona se a linha realmente não existir ainda. Se
    // colidir (P2002 na constraint `[empresaId, telefone]`), é porque a linha já existe e não
    // está elegível — quer porque já era assim antes desta chamada, quer porque outra requisição
    // concorrente para o MESMO telefone venceu a corrida bem entre o `updateMany` acima e este
    // `create` (cenário do teste de carga pedido na tarefa: 2 giros simultâneos do mesmo
    // telefone). Em ambos os casos o resultado é o mesmo: não elegível, sem tentar mais nada
    // nesta transação (ver nota de segurança da função).
    try {
      await tx.rouletteEligibility.create({ data: { empresaId, telefone, ultimoGiroEm: now } });
      elegivel = true;
    } catch (e) {
      if (!isEligibilityConflict(e)) throw e;
      elegivel = false;
    }
  }
  if (!elegivel) throw new Error("NAO_ELEGIVEL");

  // 2) "Já girou?" já foi confirmado no passo 0 (com a trava, de forma confiável mesmo sob
  //    corrida). A constraint `@unique` em `RouletteSpin.responseId` continua sendo a garantia de
  //    ÚLTIMA instância (defesa em profundidade — `isResponseJaGirouConflict`, usada nos `catch`
  //    do passo 4/5 abaixo), mas na prática não deve mais disparar por causa da trava.

  // 3) Sorteio ponderado — só prêmios ativos e (sem limite de estoque OU com estoque > 0) da
  //    loja, buscados agora (dentro da transação), nunca reaproveitando uma lista lida antes do
  //    giro anterior. Prêmios esgotados são excluídos do sorteio (estratégia escolhida entre as
  //    sugeridas na tarefa): a fatia de probabilidade deles simplesmente vira parte da fatia de
  //    "Tente novamente" daqui pra frente, sem precisar redistribuir entre os prêmios restantes.
  const candidatos = await tx.roulettePrize.findMany({
    where: {
      empresaId,
      ativo: true,
      id: { not: tenteNovamentePrizeId(empresaId) },
      OR: [{ quantidadeDisponivel: null }, { quantidadeDisponivel: { gt: 0 } }],
    },
    orderBy: { ordem: "asc" },
  });

  const sorteadoId = sortearPremio(candidatos.map((p) => ({ id: p.id, probabilidadePercent: p.probabilidadePercent })));

  // 4) "Tente novamente" — cria o spin apontando pra sentinela da loja (ver bloco no topo do
  //    arquivo), sem código e sem mexer em estoque/contagem de nenhum prêmio real.
  if (sorteadoId === null) {
    const sentinela = await ensureTenteNovamentePrize(tx, empresaId);
    try {
      await tx.rouletteSpin.create({
        data: {
          empresaId,
          responseId: response.id,
          clienteId: response.clienteId,
          telefone,
          prizeId: sentinela.id,
          codigo: null,
          status: "DISPONIVEL",
          validadeAte: null,
        },
      });
    } catch (e) {
      if (isResponseJaGirouConflict(e)) throw new Error("JA_GIROU");
      throw e;
    }
    return { ok: true, resultado: "tente_novamente" };
  }

  // 5) Prêmio de verdade — decrementa estoque (só se não-nulo) e incrementa `quantidadeGanha`
  //    atomicamente (increment/decrement do Prisma, nunca ler-e-somar), dentro da MESMA
  //    transação que cria o `RouletteSpin`.
  const premio = candidatos.find((p) => p.id === sorteadoId)!;

  if (premio.quantidadeDisponivel !== null) {
    const dec = await tx.roulettePrize.updateMany({
      where: { id: premio.id, quantidadeDisponivel: { gt: 0 } },
      data: { quantidadeDisponivel: { decrement: 1 }, quantidadeGanha: { increment: 1 } },
    });
    if (dec.count === 0) {
      // Perdeu a corrida pela última unidade pra outro giro concorrente sorteando o MESMO prêmio
      // no MESMO instante (entre o SELECT do passo 3 e este UPDATE) — janela raríssima. Política
      // escolhida (documentada pra quem for construir a tela depois): em vez de sortear de novo
      // dentro da mesma transação, este giro específico vira "Tente novamente" — mais simples e
      // ainda assim nunca entrega um prêmio que não existe mais em estoque.
      const sentinela = await ensureTenteNovamentePrize(tx, empresaId);
      try {
        await tx.rouletteSpin.create({
          data: {
            empresaId,
            responseId: response.id,
            clienteId: response.clienteId,
            telefone,
            prizeId: sentinela.id,
            codigo: null,
            status: "DISPONIVEL",
            validadeAte: null,
          },
        });
      } catch (e) {
        if (isResponseJaGirouConflict(e)) throw new Error("JA_GIROU");
        throw e;
      }
      return { ok: true, resultado: "tente_novamente" };
    }
  } else {
    await tx.roulettePrize.update({ where: { id: premio.id }, data: { quantidadeGanha: { increment: 1 } } });
  }

  // 6) Código único — gerado com CSPRNG (ver `gerarCodigoCandidato`). Não faz `findUnique` antes
  //    "pra garantir": a única garantia de verdade é a constraint `@unique` no `create` abaixo —
  //    se colidir (P2002 em `codigo`), o erro sobe sem catch (ver nota de segurança da função) e
  //    `girarRoleta` tenta o giro INTEIRO de novo (não só a geração do código), o que já resolve
  //    corretamente porque esta transação inteira é revertida (inclusive a reserva de
  //    elegibilidade e o decremento de estoque acima).
  const codigo = gerarCodigoCandidato();
  const validadeAte = new Date(now.getTime() + premio.validadeDias * 24 * 60 * 60 * 1000);

  let spin;
  try {
    spin = await tx.rouletteSpin.create({
      data: {
        empresaId,
        responseId: response.id,
        clienteId: response.clienteId,
        telefone,
        prizeId: premio.id,
        codigo,
        status: "DISPONIVEL",
        validadeAte,
      },
    });
  } catch (e) {
    if (isResponseJaGirouConflict(e)) throw new Error("JA_GIROU");
    throw e; // inclui colisão de `codigo` — tratada pelo retry de `girarRoleta`.
  }

  return {
    ok: true,
    resultado: "premio",
    codigo: spin.codigo!,
    validadeAte: spin.validadeAte!,
    premio: { id: premio.id, nome: premio.nome, descricao: premio.descricao, imagemUrl: premio.imagemUrl, icone: premio.icone },
  };
}

const MAX_GIRO_ATTEMPTS = 5;

/**
 * Giro completo pra uma `CustomerSurveyResponse` já submetida — 1 giro por avaliação (garantido
 * pela constraint `@unique` em `RouletteSpin.responseId`, reafirmada dentro da transação).
 *
 * `empresaIdEsperado` é sempre o `empresaId` resolvido a partir do TOKEN da mesa (nunca do corpo
 * da requisição) — mesmo racional de todo o resto do fluxo público deste módulo (nunca confia em
 * id vindo do cliente sem checar posse contra algo resolvido no servidor).
 */
export async function girarRoleta(params: { responseId: string; empresaIdEsperado: string; tableIdEsperado: string }): Promise<ResultadoGiro> {
  const response = await prisma.customerSurveyResponse.findUnique({
    where: { id: params.responseId },
    include: { rouletteSpin: { select: { id: true } } },
  });
  if (!response) return { ok: false, error: "Avaliação não encontrada." };
  if (response.empresaId !== params.empresaIdEsperado || response.tableId !== params.tableIdEsperado) {
    return { ok: false, error: "Esta avaliação não pertence a esta mesa." };
  }
  if (response.rouletteSpin) {
    return { ok: false, error: "Você já girou a roleta para esta avaliação." };
  }

  const config = await prisma.customerSurveyConfig.findUnique({ where: { empresaId: response.empresaId } });
  const intervaloDias = config?.giroRoletaIntervaloDias ?? GIRO_RATE_LIMIT_DIAS_PADRAO;

  const responseForTx = {
    id: response.id,
    empresaId: response.empresaId,
    telefoneInformado: response.telefoneInformado,
    clienteId: response.clienteId,
  };

  for (let attempt = 1; attempt <= MAX_GIRO_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction((tx) => executarGiro(tx, responseForTx, intervaloDias));
    } catch (e) {
      if (e instanceof Error && e.message === "NAO_ELEGIVEL") {
        return { ok: false, error: "Este telefone já girou a roleta recentemente. Tente novamente em outra visita." };
      }
      if (e instanceof Error && e.message === "JA_GIROU") {
        return { ok: false, error: "Você já girou a roleta para esta avaliação." };
      }
      // Qualquer outro P2002 (colisão de `codigo`, ou corrida na criação da sentinela "Tente
      // novamente" desta loja) é transiente — tenta o giro inteiro de novo, com uma transação
      // nova (nunca reaproveita a `tx` que falhou, ver nota de segurança em `executarGiro`).
      const retryable = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
      if (retryable && attempt < MAX_GIRO_ATTEMPTS) continue;
      throw e;
    }
  }
  // Inalcançável (o loop sempre retorna ou lança antes de sair naturalmente) — só pra satisfazer o TypeScript.
  throw new Error("Não foi possível concluir o giro após múltiplas tentativas.");
}

// ---------------------------------------------------------------------------
// Resgate do prêmio (Fase 7) — funcionário digita o `codigo` na loja
// ---------------------------------------------------------------------------

/**
 * Normaliza o código digitado por um funcionário: maiúsculas, sem espaços/traços. O formato
 * gravado é sempre 12 hex maiúsculas sem separador nenhum (ver `gerarCodigoCandidato`), mas quem
 * digita à mão pode incluir espaço ou traço (ex.: se uma tela futura exibir o código formatado em
 * blocos tipo "AB12-CD34-EF56" pra ficar mais legível) — normaliza aqui, uma única vez na
 * fonte de verdade do resgate, pra não depender de nenhuma tela específica (a tela de resgate é a
 * Fase 7-UI, ainda não construída) fazer isso certo.
 */
function normalizarCodigoResgate(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.trim().toUpperCase().replace(/[\s-]/g, "");
}

const FUSO_LOJA = "America/Sao_Paulo"; // Brasil não observa horário de verão desde 2019 — sempre UTC-3 (mesmo racional de src/lib/satisfaction.ts).

function mensagemJaResgatado(info: { resgatadoEm: Date | null; resgatadoPorNome: string | null }): string {
  const quando = info.resgatadoEm ? ` em ${info.resgatadoEm.toLocaleString("pt-BR", { timeZone: FUSO_LOJA })}` : "";
  const quem = info.resgatadoPorNome ? ` por ${info.resgatadoPorNome}` : "";
  return `Este prêmio já foi resgatado${quando}${quem}.`;
}

const MENSAGEM_EXPIRADO = "Este código expirou e não pode mais ser resgatado.";

/** Tag "de passagem": marca `EXPIRADO` só quando alguém de fato tenta resgatar um código vencido
 *  (chamada dos dois pontos de `resgatarPremio` que podem detectar isso — a pré-checagem no
 *  caminho comum, e a re-checagem depois de uma corrida perdida no `updateMany` do resgate de
 *  verdade). Não existe nenhum cron varrendo todos os spins vencidos por enquanto (fora do escopo
 *  desta fase) — um código vencido que ninguém nunca tenta resgatar continua `DISPONIVEL` pra
 *  sempre, o que é inofensivo pra este fluxo (só afetaria relatórios futuros que porventura
 *  dependam de `status` sozinho, sem olhar `validadeAte`). Condicional (`status: "DISPONIVEL"` no
 *  WHERE) por segurança: nunca sobrescreve um resgate que porventura já tenha vencido a corrida. */
async function marcarExpiradoSeAindaDisponivel(spinId: string): Promise<void> {
  await prisma.rouletteSpin.updateMany({ where: { id: spinId, status: "DISPONIVEL" }, data: { status: "EXPIRADO" } });
}

export type ResultadoResgate =
  | {
      ok: true;
      spin: {
        id: string;
        codigo: string;
        resgatadoEm: Date;
        resgatadoPor: { id: string; name: string | null };
        premio: { id: string; nome: string; descricao: string | null; imagemUrl: string | null; icone: string | null };
      };
    }
  | { ok: false; status: 400 | 404 | 409; error: string };

/**
 * Resgata um prêmio da Roleta pelo `codigo` digitado por um funcionário (garçom, caixa, gerente
 * etc.) — Fase 7. Ao contrário de `girarRoleta` (rota pública, sem autenticação, que por isso
 * achata todo erro em HTTP 400 — ver comentário do route handler irmão), esta função devolve um
 * `status` HTTP específico por tipo de erro: quem chama é sempre uma rota autenticada/com gate de
 * permissão (`POST /api/satisfacao-cliente/roleta/resgatar`), no mesmo estilo 401/403/404/409 já
 * usado pelas outras rotas administrativas deste módulo (`avaliacoes/[id]/assumir`, `.../resolver`,
 * `roleta/premios`).
 *
 * `empresaId` deve ser sempre a loja ATIVA de quem está operando o resgate (resolvida no servidor
 * via `requireActiveSingleEmpresa()` — nunca um id vindo do corpo da requisição): um código válido
 * de OUTRA loja é tratado exatamente como "não encontrado" — nunca revela que o código existe em
 * outro lugar, mesmo pra um funcionário autenticado (não há motivo de negócio pra essa informação
 * vazar entre lojas).
 *
 * Validação em 2 passos, mesmo racional de `POST .../avaliacoes/[id]/assumir` e `.../resolver`:
 * 1. Pré-checagem (leitura, fora de qualquer update) só pra devolver uma mensagem específica e
 *    amigável no caminho comum (sem corrida): já resgatado (diz quando e por quem) ou expirado.
 *    Se encontrar um código vencido ainda `DISPONIVEL`, aproveita pra marcá-lo `EXPIRADO` agora
 *    (tag "de passagem" — não existe nenhum cron varrendo todos os spins vencidos por enquanto,
 *    fora do escopo desta fase; um código vencido que ninguém nunca tenta resgatar continua
 *    `DISPONIVEL` pra sempre, o que é inofensivo — só afeta relatórios futuros que porventura
 *    dependam de `status`, não este fluxo).
 * 2. Atualização atômica condicional (`updateMany` com `status: "DISPONIVEL"` E não-expirado no
 *    próprio WHERE, mesmo padrão de `RouletteEligibility`/`checkRateLimit` — nunca "lê, decide no
 *    código, grava depois") como a fonte de verdade de fato contra corrida: dois funcionários
 *    digitando o mesmo código ao mesmo tempo (ex.: dois caixas em terminais diferentes) nunca
 *    resgatam os dois com sucesso. Se a corrida for perdida (ou o prazo expirar exatamente entre
 *    os passos 1 e 2), busca de novo só pra relatar o motivo certo — nunca solta um sucesso falso.
 */
export async function resgatarPremio(params: {
  codigoDigitado: unknown;
  empresaId: string;
  resgatadoPorId: string;
  resgatadoPorNome: string | null;
}): Promise<ResultadoResgate> {
  const codigo = normalizarCodigoResgate(params.codigoDigitado);
  if (!codigo) return { ok: false, status: 400, error: "Informe o código do prêmio." };

  const spin = await prisma.rouletteSpin.findFirst({
    where: { codigo, empresaId: params.empresaId },
    include: {
      prize: { select: { id: true, nome: true, descricao: true, imagemUrl: true, icone: true } },
      // Só usado na mensagem de erro "já foi resgatado" (branch logo abaixo) — trazido já aqui,
      // junto com `prize`, pra cobrir o caminho comum (sem corrida) sem precisar de uma 2ª ida ao
      // banco: a maioria das tentativas de resgatar um código já usado acontece bem depois do
      // resgate original, não na janela estreita de corrida que a re-checagem no fim da função
      // (após o `updateMany`) existe pra cobrir.
      resgatadoPor: { select: { name: true } },
    },
  });
  if (!spin) return { ok: false, status: 404, error: "Código não encontrado." };

  if (spin.status === "RESGATADO") {
    return {
      ok: false,
      status: 409,
      error: mensagemJaResgatado({ resgatadoEm: spin.resgatadoEm, resgatadoPorNome: spin.resgatadoPor?.name ?? null }),
    };
  }

  const now = new Date();
  const expirado = spin.status === "EXPIRADO" || (spin.validadeAte !== null && spin.validadeAte < now);
  if (expirado) {
    if (spin.status === "DISPONIVEL") await marcarExpiradoSeAindaDisponivel(spin.id);
    return { ok: false, status: 409, error: MENSAGEM_EXPIRADO };
  }

  const result = await prisma.rouletteSpin.updateMany({
    where: {
      id: spin.id,
      status: "DISPONIVEL",
      OR: [{ validadeAte: null }, { validadeAte: { gte: now } }],
    },
    data: { status: "RESGATADO", resgatadoEm: now, resgatadoPorId: params.resgatadoPorId },
  });

  if (result.count === 0) {
    // Perdeu a corrida entre a pré-checagem acima e este UPDATE (outro resgate concorrente pro
    // MESMO código, ou o prazo expirou nesse meio-tempo) — busca de novo só pra relatar o motivo
    // certo, nunca solta um sucesso falso nem duplica o resgate.
    const atual = await prisma.rouletteSpin.findUnique({
      where: { id: spin.id },
      select: { status: true, resgatadoEm: true, resgatadoPor: { select: { name: true } } },
    });
    if (atual?.status === "RESGATADO") {
      return {
        ok: false,
        status: 409,
        error: mensagemJaResgatado({ resgatadoEm: atual.resgatadoEm, resgatadoPorNome: atual.resgatadoPor?.name ?? null }),
      };
    }
    // Não foi corrida de resgate (`atual.status` não virou RESGATADO) — só pode ter sido o prazo
    // expirando bem entre a pré-checagem e o UPDATE acima. `status` ainda pode estar `DISPONIVEL`
    // neste instante exato (só a pré-checagem tagueia `EXPIRADO`, ver `marcarExpiradoSeAindaDisponivel`)
    // — tagueia agora, já que estamos aqui e já confirmamos que não foi resgatado por ninguém.
    if (atual?.status === "DISPONIVEL") await marcarExpiradoSeAindaDisponivel(spin.id);
    return { ok: false, status: 409, error: MENSAGEM_EXPIRADO };
  }

  return {
    ok: true,
    spin: {
      id: spin.id,
      codigo: spin.codigo!,
      resgatadoEm: now,
      resgatadoPor: { id: params.resgatadoPorId, name: params.resgatadoPorNome },
      premio: spin.prize,
    },
  };
}
