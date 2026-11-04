import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  RateLimitError,
} from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Avaliações — Fase 1 (só iFood). Geração da resposta automática via IA (Claude) — MESMO padrão
// de integração já estabelecido pelo Nord AI (`src/lib/nord-ai.ts`, em produção): instancia um
// client próprio (não compartilha a mesma instância do Nord AI — não há necessidade nenhuma
// disso, e assim os dois módulos ficam independentes um do outro), mesmo modelo padrão com
// override por variável de ambiente, e o MESMO tratamento de erro — nunca deixa um erro do
// provedor (chave ausente, chave inválida, rate limit, timeout, etc.) virar uma exceção não
// tratada: aqui ele vira um resultado tipado, que `src/lib/review-sync.ts` usa para decidir o
// `ReviewStatus` certo (`ERRO`, nunca uma publicação automática "no escuro").
//
// Modelo "claude-sonnet-5-5" confirmado em 2026-10-31 contra a documentação oficial da
// Anthropic — ver o comentário completo (com as duas fontes consultadas) em
// `src/lib/nord-ai.ts`. Reaproveita a MESMA variável de ambiente `ANTHROPIC_MODEL` para
// override (não há razão para este módulo ter uma variável separada: é o mesmo provedor/conta
// de IA do projeto).
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = "claude-sonnet-5-5";
// Resposta de avaliação é sempre curta (limite rígido do iFood — ver abaixo): um teto bem menor
// que o do Nord AI (1024) é suficiente e corta mais rápido uma eventual resposta fora do padrão.
const MAX_OUTPUT_TOKENS = 220;

/**
 * Mensagem amigável quando `ANTHROPIC_API_KEY` não está configurada — mesmo padrão do Nord AI
 * (nunca um 500 cru). Achado (Nina, auditoria geral): igual à mensagem equivalente em
 * `src/lib/nord-ai.ts`, apontava para "as configurações do projeto" dentro do Portal — mas
 * essa chave é uma variável de ambiente pura, sem campo correspondente em nenhuma tela do
 * sistema; quem configura é o administrador do projeto na Vercel.
 */
export const REVIEW_AI_NOT_CONFIGURED_MESSAGE =
  "A chave de IA (ANTHROPIC_API_KEY) ainda não foi configurada — não é possível gerar respostas automáticas para avaliações. Peça para o administrador cadastrar a variável de ambiente ANTHROPIC_API_KEY no painel da Vercel que hospeda o Portal.";

/** Limite de caracteres aceito pela API de Avaliações do iFood para o texto de resposta — [CONFIRMADO], ver `src/lib/ifood-client.ts`. */
export const IFOOD_REPLY_MIN_LENGTH = 10;
export const IFOOD_REPLY_MAX_LENGTH = 300;

function describeReviewAiError(error: unknown): string {
  if (error instanceof AuthenticationError) {
    return "A chave de IA configurada não é válida. Peça para o administrador revisar a configuração (ANTHROPIC_API_KEY).";
  }
  if (error instanceof RateLimitError) {
    return "O serviço de IA recebeu muitas solicitações em um curto período e está temporariamente indisponível.";
  }
  if (error instanceof APIConnectionTimeoutError) {
    return "O serviço de IA demorou demais para responder.";
  }
  if (error instanceof APIConnectionError) {
    return "Não foi possível conectar ao serviço de IA agora.";
  }
  if (error instanceof APIError) {
    return "O serviço de IA retornou um erro inesperado.";
  }
  return "Ocorreu um erro inesperado ao gerar a resposta com IA.";
}

function extractTextFromMessage(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

export type ReviewReplyInput = {
  empresaName: string;
  rating: number;
  comment: string | null;
  customerName: string | null;
};

function buildReviewReplyPrompt({ empresaName, rating, comment, customerName }: ReviewReplyInput): string {
  const identificacao = customerName
    ? `O cliente se identifica como "${customerName}".`
    : "O nome do cliente não foi informado — não invente um nome, trate de forma genérica (ex. \"Olá!\").";
  const comentarioTexto = comment
    ? `Comentário do cliente: "${comment}"`
    : "O cliente não deixou nenhum comentário em texto, só a nota.";

  return (
    `Você está respondendo, em nome do restaurante "${empresaName}", a uma avaliação de cliente recebida no iFood. ` +
    `Nota dada pelo cliente: ${rating} de 5 estrelas. ${identificacao} ${comentarioTexto}\n\n` +
    "Escreva uma resposta curta, cordial e profissional, em português do Brasil, sem usar markdown, sem emojis em excesso e sem linguagem robótica ou genérica demais. " +
    "Se a nota for baixa (1 a 3) ou o comentário mencionar algum problema, peça desculpas de forma genuína, SEM admitir culpa específica por algo que não foi confirmado, SEM prometer reembolso ou qualquer compensação financeira, e convide o cliente a entrar em contato pelos canais do restaurante para resolver. " +
    "Se a nota for alta (4 ou 5), agradeça de forma calorosa e específica ao que o cliente mencionou (quando houver comentário), sem exagerar. " +
    "NUNCA mencione, em nenhuma hipótese, que esta resposta foi gerada por inteligência artificial ou qualquer sistema automático. " +
    `Responda APENAS com o texto final da resposta — sem aspas, sem assinatura, sem introduções como "Aqui está a resposta". ` +
    `O texto final precisa ter entre ${IFOOD_REPLY_MIN_LENGTH} e ${IFOOD_REPLY_MAX_LENGTH} caracteres — limite rígido da plataforma do iFood.`
  );
}

export type ReviewReplyResult =
  | { ok: true; reply: string }
  | { ok: false; reason: "NOT_CONFIGURED" | "ERROR" | "INVALID_LENGTH"; message: string };

/**
 * Gera o texto de resposta para UMA avaliação, via API da Anthropic. Nunca lança — qualquer
 * falha (chave ausente, erro do provedor, ou resposta que terminou fora do tamanho aceito pelo
 * iFood mesmo depois de truncada) volta como um resultado tipado, para quem chama
 * (`src/lib/review-sync.ts`) decidir o `ReviewStatus` certo sem precisar de try/catch próprio.
 */
export async function generateReviewReply(input: ReviewReplyInput): Promise<ReviewReplyResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, reason: "NOT_CONFIGURED", message: REVIEW_AI_NOT_CONFIGURED_MESSAGE };

  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [{ role: "user", content: buildReviewReplyPrompt(input) }],
    });

    let reply = extractTextFromMessage(message)
      .replace(/^["“]|["”]$/g, "")
      .trim();

    if (!reply) {
      return { ok: false, reason: "ERROR", message: "O serviço de IA não gerou nenhum texto de resposta." };
    }

    // Corta no limite máximo do iFood sem cortar uma palavra no meio quando possível — nunca
    // tenta "completar" uma resposta curta demais artificialmente (ver `INVALID_LENGTH` abaixo):
    // preencher isso com texto de preenchimento genérico pareceria falso/robótico ao cliente.
    if (reply.length > IFOOD_REPLY_MAX_LENGTH) {
      const truncated = reply.slice(0, IFOOD_REPLY_MAX_LENGTH);
      const lastSpace = truncated.lastIndexOf(" ");
      reply = (lastSpace > IFOOD_REPLY_MIN_LENGTH ? truncated.slice(0, lastSpace) : truncated).trim();
    }

    if (reply.length < IFOOD_REPLY_MIN_LENGTH) {
      return {
        ok: false,
        reason: "INVALID_LENGTH",
        message: `A IA gerou uma resposta muito curta (${reply.length} caractere(s); o iFood exige pelo menos ${IFOOD_REPLY_MIN_LENGTH}).`,
      };
    }

    return { ok: true, reply };
  } catch (error) {
    return { ok: false, reason: "ERROR", message: describeReviewAiError(error) };
  }
}
