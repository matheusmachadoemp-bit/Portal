-- AlterEnum
ALTER TYPE "AccessLevel" ADD VALUE 'EXECUTAR';

-- AlterTable
ALTER TABLE "ModulePermission" ADD COLUMN "canExecute" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: perfis que já tinham canEdit ou canCreate num módulo dependiam
-- dessas flags pra executar ações operacionais (ex.: responder/concluir
-- checklist, que antes desta migração exigiam canEdit/canCreate no módulo
-- "tarefas" inteiro). Sem este backfill, a coluna nova nasceria "false" pra
-- toda linha já existente e qualquer perfil com EDITAR/TOTAL perderia a
-- capacidade de executar até alguém marcar manualmente a nova coluna
-- "Executar" na tela de Permissões — preserva o comportamento atual em vez
-- de quebrar silenciosamente quem já tinha acesso.
UPDATE "ModulePermission" SET "canExecute" = true WHERE "canEdit" = true OR "canCreate" = true;
