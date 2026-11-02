/**
 * Tipos compartilhados pela tela de chat do Nord AI (Fase 1, Etapa 2 — a Etapa 1 só construiu o
 * modelo de dados e as rotas de API, ver `src/app/api/nord-ai/**`). Espelham exatamente o que as
 * rotas devolvem (`select` do Prisma) — nenhum campo extra inventado aqui.
 */

export type NordAiEmpresaRef = { id: string; name: string; color: string } | null;

export type NordAiConversation = {
  id: string;
  title: string;
  empresaId: string | null;
  empresa: NordAiEmpresaRef;
  createdAt: string;
  updatedAt: string;
  _count: { messages: number };
};

export type NordAiMessageRole = "USER" | "ASSISTANT";

export type NordAiMessage = {
  id: string;
  role: NordAiMessageRole;
  content: string;
  createdAt: string;
};

/** Mesmo limite de `MAX_MESSAGE_LENGTH` em `src/app/api/nord-ai/conversations/[id]/messages/
 * route.ts` — duplicado aqui (não exportado por aquela rota) só para validar/mostrar o contador
 * no cliente ANTES de enviar; a rota segue sendo a fonte de verdade (quem valida de fato). */
export const NORD_AI_MAX_MESSAGE_LENGTH = 4000;
