import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasModulePermission } from "@/lib/authz";
import { assertEmpresaAccess } from "@/lib/empresa";
import { buildBusinessContext, getNordAiReply, summarizeTitle } from "@/lib/nord-ai";

/** Mesmo gate de `src/app/api/nord-ai/conversations/route.ts` — ver comentário lá. */
async function requireNordAiAccess(userId: string, role: string): Promise<boolean> {
  if (role !== "ADMINISTRADOR") return false;
  return hasModulePermission(userId, "nord-ai", "canView");
}

const MAX_MESSAGE_LENGTH = 4000;

/**
 * Busca a conversa garantindo DOIS níveis de isolamento antes de deixar ler/escrever nela:
 * 1. Dono — só o `userId` que criou a conversa pode acessá-la (histórico pessoal, ver
 *    comentário de `GET /api/nord-ai/conversations`).
 * 2. Loja — se a conversa tem `empresaId` (não é "consolidada"), o usuário atual precisa
 *    continuar tendo acesso a essa empresa (`assertEmpresaAccess`, mesmo padrão usado em todo
 *    o resto do Portal) — defensivo nesta etapa (só ADMINISTRADOR usa o módulo, que sempre tem
 *    acesso a todas as lojas), mas necessário pro dia em que outros perfis ganharem acesso.
 *
 * Os dois casos (não encontrada / encontrada mas sem acesso) devolvem `null` igualmente — nunca
 * revela se uma conversa de outro usuário/loja existe (mesmo cuidado de "nunca vazar a
 * existência de um registro fora do alcance" já documentado em `findPayableDuplicate`,
 * @/lib/boleto-barcode-server.ts).
 */
async function loadOwnedConversation(conversationId: string, userId: string, role: string) {
  const conversation = await prisma.aiConversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.userId !== userId) return null;
  if (conversation.empresaId && !(await assertEmpresaAccess(userId, role, conversation.empresaId))) return null;
  return conversation;
}

/** GET — histórico de mensagens da conversa, em ordem cronológica. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireNordAiAccess(session.user.id, session.user.role))) {
    return NextResponse.json({ error: "Sem permissão para acessar o Nord AI." }, { status: 403 });
  }

  const { id } = await params;
  const conversation = await loadOwnedConversation(id, session.user.id, session.user.role);
  if (!conversation) return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });

  const messages = await prisma.aiMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, createdAt: true },
  });

  return NextResponse.json({ conversation, messages });
}

/**
 * POST — envia uma mensagem do usuário e dispara a resposta do Nord AI. Fluxo:
 * 1. Valida/salva a mensagem do USUÁRIO (`AiMessage.role = "USER"`).
 * 2. Se ainda estiver com o título default ("Nova conversa"), ajusta pra um resumo automático
 *    da primeira pergunta (`summarizeTitle`, @/lib/nord-ai.ts — sem chamada de IA extra nesta
 *    etapa).
 * 3. Monta o CONTEXTO REAL (`buildBusinessContext`) a partir da empresa da própria conversa
 *    (nunca da loja ativa no momento do envio, que pode já ter mudado — ver comentário da
 *    função) e pede a resposta ao Nord AI (`getNordAiReply`) — que já devolve uma mensagem
 *    amigável tanto se `ANTHROPIC_API_KEY` não estiver configurada quanto se a chamada à API
 *    falhar por qualquer motivo (rate limit, chave inválida, timeout etc.), nunca lançando.
 * 4. Salva a resposta do ASSISTENTE (`AiMessage.role = "ASSISTANT"`) e atualiza
 *    `AiConversation.updatedAt`.
 * 5. Devolve as duas mensagens já persistidas.
 *
 * Esta etapa não reenvia o histórico de mensagens anteriores da conversa pro modelo (cada
 * pergunta é respondida isoladamente, só com o contexto de dados + a pergunta atual) — ver
 * nota no topo de @/lib/nord-ai.ts.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireNordAiAccess(session.user.id, session.user.role))) {
    return NextResponse.json({ error: "Sem permissão para acessar o Nord AI." }, { status: 403 });
  }

  const { id } = await params;
  const conversation = await loadOwnedConversation(id, session.user.id, session.user.role);
  if (!conversation) return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content) return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });
  if (content.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `Mensagem muito longa (máximo de ${MAX_MESSAGE_LENGTH} caracteres).` }, { status: 400 });
  }

  const userMessage = await prisma.aiMessage.create({
    data: { conversationId: conversation.id, role: "USER", content },
    select: { id: true, role: true, content: true, createdAt: true },
  });

  const newTitle = conversation.title === "Nova conversa" ? summarizeTitle(content) : null;

  const businessContext = await buildBusinessContext(conversation.empresaId, session.user.id, session.user.role);
  const reply = await getNordAiReply(content, businessContext);

  const assistantMessage = await prisma.aiMessage.create({
    data: { conversationId: conversation.id, role: "ASSISTANT", content: reply.content },
    select: { id: true, role: true, content: true, createdAt: true },
  });

  await prisma.aiConversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date(), ...(newTitle ? { title: newTitle } : {}) },
  });

  return NextResponse.json({ userMessage, assistantMessage }, { status: 201 });
}
