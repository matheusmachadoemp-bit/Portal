import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { pct } from "@/lib/calc";
import { getUserEmpresas } from "@/lib/empresa";
import { loadSalesSummary, loadProgressoMeta } from "@/lib/inicio";
import { spDayStart, spDayEnd } from "@/lib/periods";
import { spDateKey, spHours, spMinutes } from "@/lib/checklist";

// ---------------------------------------------------------------------------
// Nord AI — Fase 1, Etapa 1 (fundação). Princípio central do módulo (decisão do Matheus,
// documentada também no bloco "NORD AI" de prisma/schema.prisma): o assistente NUNCA pode
// inventar um número/indicador — toda resposta sobre dado real do negócio vem de uma consulta
// real ao banco (ver `buildBusinessContext` abaixo), nunca de "achismo" do modelo de
// linguagem. Esta etapa não envia o histórico da conversa de volta ao modelo (cada pergunta é
// respondida isoladamente, só com o contexto de dados + a pergunta atual) e não usa
// streaming/function calling — ambos ficam para uma etapa futura, se fizer sentido.
// ---------------------------------------------------------------------------

/**
 * Modelo usado pelo Nord AI. Confirmado em 2026-10-31 contra a documentação oficial da
 * Anthropic (platform.claude.com/docs/en/models/sonnet-5-5/overview): "claude-sonnet-5-5" é o
 * Sonnet "Active (latest)" no momento desta implementação — "claude-sonnet-5" (sugerido no
 * pedido original como ponto de partida) já virou legacy desde o lançamento do 5.5 em
 * 2026-09-28 (platform.claude.com/docs/en/models/sonnet-5/overview: "Claude Sonnet 5 is a
 * legacy model; Claude Sonnet 5.5 is the current Sonnet model"). Também confirmado como um
 * valor conhecido pelo próprio SDK instalado (`@anthropic-ai/sdk` 1.3.0, tipo `Messages.Model`
 * já lista `"claude-sonnet-5-5"` como literal, não só via fallback `string & {}`).
 *
 * Sobrescrevível por `ANTHROPIC_MODEL` (variável de ambiente opcional) para o Matheus poder
 * apontar para um modelo mais novo sem precisar de deploy de código, caso a Anthropic lance
 * outro Sonnet antes deste valor ser atualizado de novo.
 */
const DEFAULT_MODEL = "claude-sonnet-5-5";
const MAX_OUTPUT_TOKENS = 1024;

/**
 * Mensagem amigável devolvida (e salva no histórico, igual qualquer outra resposta do
 * assistente) quando `ANTHROPIC_API_KEY` ainda não está configurada nas variáveis de ambiente
 * — caminho esperado em produção até o Matheus terminar de configurar a chave. Nunca um erro
 * 500 cru, nunca falha a requisição.
 */
export const NORD_AI_NOT_CONFIGURED_MESSAGE =
  "O Nord AI ainda não foi configurado. Peça para o administrador configurar a chave de IA nas configurações do projeto.";

/** "DD/MM/AAAA HH:mm" em horário de Brasília — mesmo offset fixo (UTC-3) usado em todo o resto do backend (ver @/lib/checklist e @/lib/periods). */
function formatSpDateTime(date: Date): string {
  const [year, month, day] = spDateKey(date).split("-");
  const hh = String(spHours(date)).padStart(2, "0");
  const mm = String(spMinutes(date)).padStart(2, "0");
  return `${day}/${month}/${year} ${hh}:${mm}`;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export type NordAiBusinessContext = {
  /** Nome da empresa específica, ou "Grupo Nord (consolidado)" quando soma mais de uma loja. */
  empresaLabel: string;
  /** "DD/MM/AAAA HH:mm", horário de Brasília — instante em que este contexto foi calculado. */
  calculadoEm: string;
  faturamentoHoje: number;
  pedidosHoje: number;
  faturamentoMesAtual: number;
  metaMensal: number;
  progressoMetaPercent: number;
};

/**
 * Resolve quais empresas usar como fonte de dados para uma conversa: a própria loja da
 * conversa (`AiConversation.empresaId`), se ela tiver uma — ou, se for uma conversa
 * "consolidada" (`empresaId = null`, ver comentário do model em prisma/schema.prisma), TODAS
 * as lojas que o usuário atual pode acessar HOJE (mesmo critério de `getUserEmpresas`,
 * @/lib/empresa.ts). De propósito reavaliado a cada mensagem (nunca congelado no momento em
 * que a conversa foi criada) — mesmo comportamento do modo "Grupo Nord" no resto do Portal
 * (`empresaIdsForContext` em modo "grupo" também sempre reflete o acesso atual do usuário).
 */
async function resolveContextEmpresas(
  conversationEmpresaId: string | null,
  userId: string,
  role: string
): Promise<{ empresaIds: string[]; label: string }> {
  if (conversationEmpresaId) {
    const empresa = await prisma.empresa.findUnique({
      where: { id: conversationEmpresaId },
      select: { id: true, name: true },
    });
    if (empresa) return { empresaIds: [empresa.id], label: empresa.name };
    // Empresa da conversa foi excluída depois de criada — não deveria acontecer na prática
    // (onDelete: SetNull no schema já zera `empresaId` nesse caso), mas cai pro consolidado
    // como rede de segurança em vez de quebrar a resposta.
  }

  const empresas = await getUserEmpresas(userId, role);
  return { empresaIds: empresas.map((e) => e.id), label: "Grupo Nord (consolidado)" };
}

/**
 * Contexto REAL de dados do negócio, já calculado — nunca "achismo" do modelo (princípio
 * central do módulo). Reaproveita exatamente as mesmas consultas já usadas pela Tela de Início
 * (`loadSalesSummary`/`loadProgressoMeta`, @/lib/inicio.ts): faturamento de HOJE e progresso da
 * meta do MÊS CORRENTE, somados entre todas as empresas do contexto quando mais de uma (modo
 * consolidado). `progressoMetaPercent` é recalculado a partir dos TOTAIS somados (nunca uma
 * média dos percentuais individuais de cada loja, que distorceria o resultado quando as metas
 * de cada loja têm tamanhos diferentes).
 *
 * Retorna `null` só no caso defensivo em que o usuário não tem acesso a nenhuma empresa (não
 * deveria acontecer para quem já passou pelo gate de `role === "ADMINISTRADOR"` desta etapa,
 * que sempre tem acesso a todas — ver `hasFullAccess`, @/lib/empresa.ts).
 */
export async function buildBusinessContext(
  conversationEmpresaId: string | null,
  userId: string,
  role: string
): Promise<NordAiBusinessContext | null> {
  const { empresaIds, label } = await resolveContextEmpresas(conversationEmpresaId, userId, role);
  if (empresaIds.length === 0) return null;

  const now = new Date();
  const [vendasHoje, progressoMeta] = await Promise.all([
    Promise.all(empresaIds.map((id) => loadSalesSummary(id, spDayStart(now), spDayEnd(now)))),
    Promise.all(empresaIds.map((id) => loadProgressoMeta(id))),
  ]);

  const faturamentoHoje = vendasHoje.reduce((acc, v) => acc + v.faturamento, 0);
  const pedidosHoje = vendasHoje.reduce((acc, v) => acc + v.pedidos, 0);
  const faturamentoMesAtual = progressoMeta.reduce((acc, m) => acc + m.faturamentoMes, 0);
  const metaMensal = progressoMeta.reduce((acc, m) => acc + m.metaMensal, 0);

  return {
    empresaLabel: label,
    calculadoEm: formatSpDateTime(now),
    faturamentoHoje,
    pedidosHoje,
    faturamentoMesAtual,
    metaMensal,
    progressoMetaPercent: pct(faturamentoMesAtual, metaMensal),
  };
}

/**
 * Monta o system prompt — sempre inclui o CONTEXTO REAL já calculado (nunca deixa o modelo
 * calcular nada por conta própria) e instrui explicitamente a nunca inventar número/indicador
 * e a dizer claramente quando não tiver dado suficiente pra responder algo.
 */
function buildSystemPrompt(context: NordAiBusinessContext | null): string {
  const base =
    'Você é o "Nord AI", o assistente de inteligência artificial do Portal Nord — o sistema de ' +
    "gestão interno da Nord Pizza & Burger e da Zarki Sushi (Grupo Nord). Você conversa com a " +
    "equipe de gestão do grupo (nesta etapa inicial, só o cargo Administrador tem acesso a " +
    "você) para ajudar a entender os dados do negócio.\n\n" +
    "REGRA MAIS IMPORTANTE, sem exceção: você NUNCA pode inventar, estimar ou \"calcular de " +
    "cabeça\" nenhum número ou indicador do negócio (faturamento, meta, CMV, estoque, vendas, " +
    "etc.). Toda resposta sobre um dado real deve se basear EXCLUSIVAMENTE no bloco \"CONTEXTO " +
    "REAL\" abaixo, que já foi calculado por uma consulta direta ao banco de dados do Portal — " +
    "nunca na sua própria estimativa. Se a pergunta pedir um dado que não está nesse contexto, " +
    "diga claramente que você ainda não tem acesso a esse dado nesta etapa do Nord AI, em vez " +
    "de tentar adivinhar ou aproximar um valor.";

  if (!context) {
    return (
      base +
      "\n\nCONTEXTO REAL: não foi possível calcular nenhum dado real para este usuário agora " +
      "(sem nenhuma loja associada ao acesso dele). Informe isso com educação se perguntarem " +
      "sobre números do negócio."
    );
  }

  return (
    base +
    `\n\nCONTEXTO REAL (calculado em ${context.calculadoEm}, horário de Brasília; referente a: ${context.empresaLabel}):\n` +
    `- Faturamento de hoje: ${formatCurrency(context.faturamentoHoje)} (${context.pedidosHoje} pedido(s)).\n` +
    `- Faturamento do mês corrente (até agora): ${formatCurrency(context.faturamentoMesAtual)}.\n` +
    `- Meta de faturamento do mês corrente: ${formatCurrency(context.metaMensal)}.\n` +
    `- Progresso da meta mensal: ${context.progressoMetaPercent.toFixed(1)}%.\n\n` +
    "Use estes números para responder perguntas sobre faturamento de hoje ou progresso da meta " +
    "mensal. Para qualquer outro indicador (CMV, estoque, metas de outras áreas, desempenho de " +
    "marketing etc.), explique que esta etapa inicial do Nord AI ainda não calcula esse dado " +
    "específico — não tente deduzi-lo a partir dos números acima."
  );
}

function extractTextFromMessage(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

/** Texto amigável para cada família de erro conhecida do SDK — nunca um 500 cru nem o texto bruto do provedor externo. */
function describeNordAiError(error: unknown): string {
  if (error instanceof AuthenticationError) {
    return "A chave de IA configurada não é válida. Peça para o administrador revisar a configuração do Nord AI.";
  }
  if (error instanceof RateLimitError) {
    return "O Nord AI recebeu muitas perguntas em um curto período e está temporariamente indisponível. Tente novamente em alguns instantes.";
  }
  if (error instanceof APIConnectionTimeoutError) {
    return "O Nord AI demorou demais para responder. Tente novamente.";
  }
  if (error instanceof APIConnectionError) {
    return "Não foi possível conectar ao serviço de IA agora. Tente novamente em alguns instantes.";
  }
  if (error instanceof APIError) {
    return "O serviço de IA retornou um erro inesperado. Tente novamente mais tarde.";
  }
  return "Ocorreu um erro inesperado ao consultar o Nord AI. Tente novamente mais tarde.";
}

export type NordAiReplyResult = { content: string };

/**
 * Chama a API da Anthropic (ou devolve a mensagem amigável de "não configurado" sem nem
 * tentar, se `ANTHROPIC_API_KEY` não estiver definida — caminho principal de teste enquanto a
 * chave real não está disponível). NUNCA lança: qualquer erro do provedor (chave inválida,
 * rate limit, timeout, etc.) é convertido numa mensagem amigável por `describeNordAiError`, pra
 * quem chamar nunca precisar tratar um 500 cru por causa de uma falha externa.
 */
export async function getNordAiReply(userMessage: string, context: NordAiBusinessContext | null): Promise<NordAiReplyResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { content: NORD_AI_NOT_CONFIGURED_MESSAGE };

  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: buildSystemPrompt(context),
      messages: [{ role: "user", content: userMessage }],
    });
    const text = extractTextFromMessage(message);
    return { content: text || "Não consegui gerar uma resposta agora. Tente reformular a pergunta." };
  } catch (error) {
    return { content: describeNordAiError(error) };
  }
}

/**
 * Resumo automático simples do título da conversa — sem chamada de IA extra (fora de escopo
 * desta etapa): usa as primeiras ~60 letras da primeira pergunta do usuário, mesma ideia de
 * título de conversa de qualquer chat. Chamado só quando a conversa ainda está com o título
 * default ("Nova conversa") no momento da primeira mensagem (ver rota de mensagens).
 */
export function summarizeTitle(firstMessage: string): string {
  const trimmed = firstMessage.trim().replace(/\s+/g, " ");
  if (!trimmed) return "Nova conversa";
  return trimmed.length <= 60 ? trimmed : `${trimmed.slice(0, 60)}…`;
}
