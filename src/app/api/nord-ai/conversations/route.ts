import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasModulePermission } from "@/lib/authz";
import { getActiveEmpresaContext } from "@/lib/empresa";

/**
 * Nord AI — Fase 1, Etapa 1 (fundação). Acesso restrito a Role ADMINISTRADOR — checagem
 * literal, independente do menu lateral/`ModulePermission`, mesmo padrão de
 * `src/app/api/feedback/*` (Central de Bugs e Melhorias). `hasModulePermission` é chamada
 * mesmo assim (sempre `true` pra ADMINISTRADOR, que não depende de nenhuma linha de
 * `ModulePermission` — ver regra 1 do comentário de `hasModulePermission`, @/lib/authz) por
 * consistência com o resto do projeto e pra já deixar o código pronto pro dia em que outros
 * perfis ganharem acesso (quando "nord-ai" entrar no catálogo `MODULES`).
 */
async function requireNordAiAccess(userId: string, role: string): Promise<boolean> {
  if (role !== "ADMINISTRADOR") return false;
  return hasModulePermission(userId, "nord-ai", "canView");
}

/**
 * GET — lista as conversas do USUÁRIO LOGADO (nunca "todas as conversas de qualquer
 * Administrador"): decisão de design desta etapa — conversa com o Nord AI é um histórico
 * pessoal (igual qualquer chat), não um registro compartilhado entre toda a liderança. Se o
 * Matheus quiser uma visão consolidada entre administradores no futuro, isso é uma mudança de
 * escopo separada (ex.: uma tela de "conversas de todo mundo"), não o comportamento padrão
 * desta lista.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireNordAiAccess(session.user.id, session.user.role))) {
    return NextResponse.json({ error: "Sem permissão para acessar o Nord AI." }, { status: 403 });
  }

  const conversations = await prisma.aiConversation.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      empresaId: true,
      empresa: { select: { id: true, name: true, color: true } },
      createdAt: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });

  return NextResponse.json({ conversations });
}

/**
 * POST — cria uma conversa nova para o usuário logado. `empresaId` é SEMPRE resolvido no
 * servidor a partir do contexto de loja ativo (nunca aceito do corpo da requisição, mesmo
 * princípio de "nunca confiar em empresaId vindo do cliente" já usado em
 * `requireActiveSingleEmpresa`, @/lib/empresa.ts): modo loja única -> conversa amarrada a essa
 * empresa; modo "Grupo Nord" -> conversa "consolidada" (`empresaId: null`, ver comentário do
 * model `AiConversation` em prisma/schema.prisma). Sem corpo obrigatório — título nasce como o
 * default "Nova conversa" e é ajustado automaticamente pela rota de mensagens na primeira
 * pergunta (ver `summarizeTitle`, @/lib/nord-ai.ts).
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireNordAiAccess(session.user.id, session.user.role))) {
    return NextResponse.json({ error: "Sem permissão para acessar o Nord AI." }, { status: 403 });
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) {
    return NextResponse.json({ error: "Nenhuma loja disponível para este usuário." }, { status: 400 });
  }
  const empresaId = ctx.mode === "single" ? ctx.empresa.id : null;

  const conversation = await prisma.aiConversation.create({
    data: { userId: session.user.id, empresaId },
    select: {
      id: true,
      title: true,
      empresaId: true,
      empresa: { select: { id: true, name: true, color: true } },
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ conversation }, { status: 201 });
}
