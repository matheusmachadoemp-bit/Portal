import { randomBytes } from "crypto";
import QRCode from "qrcode";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createNotifications } from "@/lib/notifications";
import type { CustomerSurveyQuestion } from "@prisma/client";

// ---------------------------------------------------------------------------
// Rate limit do fluxo público (`/avaliar/[token]` + `/api/satisfacao-cliente/
// responder/[token]`) — mesmo padrão de `checkSatisfactionRateLimit`
// (src/lib/satisfaction-server.ts, RH), chave IP+token compartilhada entre
// GET (resolver mesa) e POST (submeter avaliação) do mesmo arquivo de rota,
// pra não contar em dobro.
//
// Números DIFERENTES do RH de propósito (20 tentativas / 10min): lá o token é
// de um CONVITE INDIVIDUAL (1 pessoa, usado 1 vez só). Aqui o token é de uma
// MESA FÍSICA REUTILIZÁVEL — o mesmo QR Code é escaneado por dezenas de
// clientes por dia, inclusive vários simultâneos numa mesa (cada pessoa do
// grupo abrindo a página no próprio celular) e, num restaurante com wifi
// público, potencialmente várias mesas/grupos DIFERENTES ao longo do dia
// compartilhando o mesmo IP de saída da rede do estabelecimento. Copiar o
// limite do RH 1:1 derrubaria a própria proteção num dia de movimento normal
// (achado já previsto na investigação original, seção 4 dos riscos). Janela
// maior (15min) + teto mais alto (30) cobre um grupo grande na mesma mesa
// retentando/recarregando a página sem esbarrar no limite, mas ainda barra
// um script automatizado martelando o mesmo link em sequência.
const CUSTOMER_SURVEY_RATE_LIMIT_MAX = 30;
const CUSTOMER_SURVEY_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export async function checkCustomerSurveyRateLimit(headers: Headers, token: string): Promise<boolean> {
  const ip = getClientIp(headers);
  return checkRateLimit(`customer-survey:${ip}:${token}`, {
    windowMs: CUSTOMER_SURVEY_RATE_LIMIT_WINDOW_MS,
    max: CUSTOMER_SURVEY_RATE_LIMIT_MAX,
  });
}

// ---------------------------------------------------------------------------
// Mesa/QR (CustomerSurveyTable)
// ---------------------------------------------------------------------------

/** 40 chars hex (160 bits) — mesmo padrão de `SatisfactionInvitation.token`. */
export function generateTableToken(): string {
  return randomBytes(20).toString("hex");
}

export async function resolveTableByToken(token: string) {
  return prisma.customerSurveyTable.findUnique({
    where: { token },
    include: { empresa: { select: { id: true, name: true, logo: true, color: true, active: true } } },
  });
}

export type TableLookup = Awaited<ReturnType<typeof resolveTableByToken>>;

/** Nunca revela a diferença entre "token não existe" e "mesa/loja desativada" no texto — só no state. */
export function tableState(table: TableLookup): "invalido" | "inativa" | "ok" {
  if (!table) return "invalido";
  if (!table.ativo || !table.empresa.active) return "inativa";
  return "ok";
}

export function buildAvaliarUrl(origin: string, token: string): string {
  return `${origin}/avaliar/${token}`;
}

export async function generateQrCodeDataUrl(url: string): Promise<string> {
  // Mesmo padrão já usado em Manutenção > Equipamentos
  // (src/app/portal/manutencao/equipamentos/[id]/page.tsx).
  return QRCode.toDataURL(url, { width: 240, margin: 1 });
}

// ---------------------------------------------------------------------------
// Perguntas (CustomerSurveyQuestion)
//
// `empresaId = null` (catálogo compartilhado, seedado) e `empresaId = <loja>`
// (perguntas próprias daquela loja) são somados (UNION), nunca um substitui o
// outro por inteiro — mesmo padrão já usado por Cursos/Ficha Técnica no resto
// do app (`OR: [{ empresaId: null }, { empresaId: { in/equals } }]`, ver
// `src/lib/university-server.ts`). "Customizar o questionário" (decisão do
// Matheus) significa a loja poder ACRESCENTAR perguntas próprias além das
// compartilhadas — não existe (nem faz falta, pra esta fase) um jeito de uma
// loja "esconder" uma pergunta compartilhada específica só pra ela; isso
// exigiria um campo novo de schema (ex. uma tabela de exclusões por loja),
// que não foi pedido e não bloqueia o fluxo público funcionar de verdade.
// Registrar essa leitura no relatório pro líder confirmar/ajustar depois.
// ---------------------------------------------------------------------------

const NOTA_GERAL_TITULO_PADRAO = "De 0 a 10, qual nota você dá para a sua experiência hoje?";

function findActiveFixedNotaGeralQuestion() {
  return prisma.customerSurveyQuestion.findFirst({
    where: { fixaNotaGeral: true, ativo: true },
    orderBy: { createdAt: "asc" },
  });
}

/** `CustomerSurveyQuestion` não tem nenhuma outra constraint única além do índice parcial de
 *  `fixaNotaGeral` (ver comentário no schema) — então um P2002 nesta chamada específica de
 *  `create` só pode ser essa. Ainda assim inspeciona `target` (cobrindo tanto nome de coluna
 *  quanto nome do índice, dependendo de como o Postgres/Prisma relatam essa violação — não
 *  testado nos dois formatos, então checa substring nos dois casos) antes de cair no fallback
 *  `true`, mesmo padrão de `isNumeroConflict` em `mesas/route.ts`. */
function isFixaNotaGeralConflict(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === "P2002" &&
    ((e.meta?.target as string[] | undefined)?.some((t) => t.includes("fixaNotaGeral")) ?? true)
  );
}

/**
 * Garante que sempre exista, no catálogo COMPARTILHADO, uma pergunta
 * `fixaNotaGeral = true` ativa — criando-a na primeira vez que for preciso
 * (lazy bootstrap), já que o deploy automático nunca roda `prisma/seed.ts`
 * (só `prisma migrate deploy`, ver scripts/migrate-deploy.sh). Sem isso, uma
 * produção nova (ou uma que nunca rodou o seed manualmente) ficaria sem a
 * pergunta obrigatória de nota geral até alguém lembrar de rodar o seed.
 *
 * De propósito só olha `fixaNotaGeral`, nunca `empresaId`: a API de
 * perguntas (POST/PATCH) nunca deixa criar/marcar uma pergunta própria de
 * loja como `fixaNotaGeral = true` (ver rota), então só deve existir esta
 * ÚNICA linha compartilhada no sistema inteiro — todas as lojas a enxergam
 * igual, via a mesma query UNION acima.
 *
 * Atômico de verdade (achado do Teulis na revisão da Fase 2): o
 * `findFirst` + `create` sozinho tinha uma corrida real — dois primeiros
 * acessos concorrentes, nenhum encontra a linha ainda, os dois tentam
 * criar. Agora o banco tem um índice único PARCIAL (`WHERE fixaNotaGeral =
 * true`, ver prisma/schema.prisma e a migration
 * `20260924160000_customer_survey_question_fixa_nota_geral_unique`) que
 * rejeita a segunda tentativa — a corrida ainda pode acontecer, mas não
 * pode mais criar 2 linhas: quem perde pega P2002 e busca de novo pra
 * pegar a linha que o vencedor da corrida criou, mesmo padrão de retry que
 * `isNumeroConflict` (mesas/route.ts) já usa para número de mesa duplicado.
 */
export async function ensureFixedNotaGeralQuestion(): Promise<CustomerSurveyQuestion> {
  const existing = await findActiveFixedNotaGeralQuestion();
  if (existing) return existing;

  try {
    return await prisma.customerSurveyQuestion.create({
      data: {
        empresaId: null,
        tipo: "NOTA_0_10",
        titulo: NOTA_GERAL_TITULO_PADRAO,
        obrigatoria: true,
        ordem: 0,
        fixaNotaGeral: true,
      },
    });
  } catch (e) {
    if (!isFixaNotaGeralConflict(e)) throw e;
    const winner = await findActiveFixedNotaGeralQuestion();
    // Só perdeu a corrida se o vencedor JÁ estiver visível aqui — se não estiver (ex.: alguém
    // desativou a linha vencedora bem nesse instante, janela minúscula), relança em vez de
    // mascarar o erro original com um `undefined` silencioso.
    if (winner) return winner;
    throw e;
  }
}

/** Perguntas REGULARES (não fixaNotaGeral) efetivas para uma loja: compartilhadas + próprias. */
export async function getRegularQuestions(empresaId: string): Promise<CustomerSurveyQuestion[]> {
  return prisma.customerSurveyQuestion.findMany({
    where: { ativo: true, fixaNotaGeral: false, OR: [{ empresaId: null }, { empresaId }] },
    orderBy: { ordem: "asc" },
  });
}

/** Conjunto completo (nota geral + regulares) que o formulário público de uma loja deve exibir. */
export async function getPublicSurveyQuestions(
  empresaId: string
): Promise<{ notaGeralQuestion: CustomerSurveyQuestion; perguntas: CustomerSurveyQuestion[] }> {
  const [notaGeralQuestion, perguntas] = await Promise.all([
    ensureFixedNotaGeralQuestion(),
    getRegularQuestions(empresaId),
  ]);
  return { notaGeralQuestion, perguntas };
}

// ---------------------------------------------------------------------------
// Garçons selecionáveis (Employee.atendeSalao)
// ---------------------------------------------------------------------------

export type SelectableGarcom = { id: string; name: string };

/** Só nome/id — mesmo racional de `getSelectableTeamMembers` (src/lib/empresa.ts): isso vira
 *  prop de uma página 100% pública, nunca exponha cargo/telefone/e-mail aqui. */
export async function getSelectableGarcons(empresaId: string): Promise<SelectableGarcom[]> {
  return prisma.employee.findMany({
    where: { empresaId, atendeSalao: true, status: "ATIVO" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** Confirma que `garcomId` atende salão, está ativo E pertence à loja da mesa — nunca confia no id vindo do cliente. */
export async function isValidGarcomIndicado(garcomId: string, empresaId: string): Promise<boolean> {
  const employee = await prisma.employee.findFirst({
    where: { id: garcomId, empresaId, atendeSalao: true, status: "ATIVO" },
    select: { id: true },
  });
  return !!employee;
}

// ---------------------------------------------------------------------------
// Cliente (identificação do formulário público) — nunca duplica por telefone.
// ---------------------------------------------------------------------------

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** `findFirst` + `create` só se não achar — nunca atualiza um Cliente já existente (mesmo
 *  comportamento documentado na investigação original: não sobrescreve um cadastro por um
 *  formulário público anônimo). */
export async function findOrCreateClienteByTelefone(
  empresaId: string,
  telefone: string,
  nome: string,
  dataNascimento: Date | null
) {
  const existing = await prisma.cliente.findFirst({ where: { empresaId, telefone } });
  if (existing) return existing;
  return prisma.cliente.create({ data: { empresaId, telefone, nome, dataNascimento } });
}

// ---------------------------------------------------------------------------
// Config (CustomerSurveyConfig) — cálculo de `critica`
// ---------------------------------------------------------------------------

const NOTA_CRITICA_ABAIXO_DE_PADRAO = 6; // mesmo default do schema, usado só se a config sumir por algum motivo.

export async function isNotaCritica(empresaId: string, notaGeral: number): Promise<boolean> {
  const config = await prisma.customerSurveyConfig.findUnique({ where: { empresaId } });
  const limite = config?.notaCriticaAbaixoDe ?? NOTA_CRITICA_ABAIXO_DE_PADRAO;
  return notaGeral < limite;
}

// ---------------------------------------------------------------------------
// Push de avaliação crítica (Fase 3) — reaproveita `createNotifications`
// (src/lib/notifications.ts), mesmo padrão já usado por Manutenção/Tarefas/
// Fechamento do Dia: grava a `Notification` (sino) e dispara Web Push de
// verdade pra cada `CustomerSurveyAlertRecipient` ativo da loja.
// ---------------------------------------------------------------------------

/**
 * Dispara pros destinatários configurados (`CustomerSurveyAlertRecipient.ativo = true`) da loja
 * da avaliação — nunca lança (mesma garantia de `createNotifications`/`sendPushToUser`: falha de
 * push é só logada, nunca derruba a submissão pública que acabou de gravar a avaliação). Sem
 * destinatário nenhum configurado, não faz nada (nem grava `Notification` nem tenta push) — é o
 * estado padrão de uma loja nova, até alguém configurar a lista na tela de Configurações (fase
 * futura).
 */
export async function notifyCriticalResponse(response: {
  id: string;
  empresaId: string;
  tableId: string | null;
  nomeInformado: string;
  notaGeral: number;
}): Promise<void> {
  const recipients = await prisma.customerSurveyAlertRecipient.findMany({
    where: { empresaId: response.empresaId, ativo: true },
    select: { userId: true },
  });
  if (recipients.length === 0) return;

  const table = response.tableId
    ? await prisma.customerSurveyTable.findUnique({ where: { id: response.tableId }, select: { numero: true } })
    : null;
  const mesaLabel = table ? ` (Mesa ${table.numero})` : "";

  await createNotifications(
    recipients.map((r) => ({
      userId: r.userId,
      type: "AVALIACAO_CRITICA",
      title: "Avaliação crítica recebida",
      body: `${response.nomeInformado} deu nota ${response.notaGeral}/10${mesaLabel} na pesquisa de satisfação.`,
      priority: "CRITICA" as const,
      customerSurveyResponseId: response.id,
      // Fase 4 ainda não existe (página Avaliações) — o link já aponta pro lugar certo pra
      // quando ela existir, sem precisar mexer aqui de novo (mesmo raciocínio já usado pro QR
      // Code apontar pra `/avaliar/[token]` antes da tela existir, na Fase 2).
      url: `/portal/satisfacao-cliente/avaliacoes/${response.id}`,
    }))
  );
}
