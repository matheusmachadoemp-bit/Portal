-- Nord AI — Fase 1, Etapa 1: fundação do módulo (schema). Cria as duas tabelas que guardam o
-- histórico de conversas com o assistente de IA do Portal (sem a parte de previsão/
-- monitoramento proativo ainda — isso é de uma fase futura). Ver comentário completo do bloco
-- "NORD AI" em prisma/schema.prisma para o racional de cada decisão de design (especialmente
-- `AiConversation.empresaId` nullable, sem tabela de junção N:N: uma conversa é sempre "de uma
-- loja" ou "consolidada/Grupo Nord", nunca de um subconjunto arbitrário de lojas — mesmo modelo
-- binário já usado em todo o resto do Portal, ver `EmpresaContext.mode` em src/lib/empresa.ts).
--
-- `AiMessage.role` como enum fixo (USER | ASSISTANT) — não um campo editável pelo usuário, não
-- precisa do tratamento de "valor novo não bate com enum" documentado em CLAUDE.md para
-- importação de arquivos (essa regra vale para dado que entra de fora do controle do próprio
-- código, ex. forma de pagamento de um arquivo do Saipos — aqui os dois valores são gravados
-- só pelo próprio backend, nunca por entrada externa).
--
-- Validado do zero contra um Postgres descartável local (todo o histórico de migrations em
-- produção + esta, aplicando sem erro — ver relatório da tarefa).
-- CreateEnum
CREATE TYPE "AiMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "AiConversation" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Nova conversa',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiConversation_userId_updatedAt_idx" ON "AiConversation"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AiConversation_empresaId_idx" ON "AiConversation"("empresaId");

-- CreateIndex
CREATE INDEX "AiMessage_conversationId_createdAt_idx" ON "AiMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
