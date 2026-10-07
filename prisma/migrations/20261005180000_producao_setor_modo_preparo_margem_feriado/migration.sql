-- AlterTable
ALTER TABLE "ProductionItem" ADD COLUMN     "modoPreparo" TEXT,
ADD COLUMN     "setorId" TEXT;

-- AlterTable
ALTER TABLE "ProductionSettings" ADD COLUMN     "margemFeriadoPercent" DOUBLE PRECISION NOT NULL DEFAULT 20;

-- CreateTable
CREATE TABLE "ProductionSetor" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#2952E3',
    "icon" TEXT NOT NULL DEFAULT 'ChefHat',
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionSetor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductionSetor_key_key" ON "ProductionSetor"("key");

-- AddForeignKey
ALTER TABLE "ProductionItem" ADD CONSTRAINT "ProductionItem_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "ProductionSetor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill de dado (Produção > Fase 1, "margem de segurança 10%"): a margem de 10% já é usada
-- corretamente pelo motor de forecast (`applySafetyMargin` em src/lib/producao-forecast.ts), mas
-- todo ProductionItem criado até hoje ficou gravado com o default antigo do schema
-- (`margemSeguranca Float @default(0)`), ou seja, 0% de margem real aplicada em produção — a regra
-- de negócio (10%) nunca foi de fato preenchida nos itens já cadastrados, só valeria para quem
-- editasse manualmente o item pela tela (Produção > Produtos) depois desta mudança.
--
-- Só atualiza quem está exatamente em 0 — item que algum usuário já ajustou manualmente para outro
-- valor (inclusive um valor explicitamente setado para 0, caso raro) não é sobrescrito, mesmo sem
-- dar para distinguir "nunca configurado" de "configurado para 0 de propósito" (ambos ficam com o
-- mesmo valor no banco hoje); como todo item existente antes desta migration está em 0 por nunca
-- ter sido editado nesse campo, aceitar esse pequeno risco é preferível a deixar 100% dos itens
-- sem a margem de segurança combinada com o Matheus.
-- Idempotente: rodar de novo não tem efeito (depois da primeira execução, só sobra 0 quem foi
-- reconfigurado manualmente para 0 — ver acima).
UPDATE "ProductionItem" SET "margemSeguranca" = 10 WHERE "margemSeguranca" = 0;

-- Itens novos também nascem com a margem de segurança combinada (10%), em vez de 0% — senão o
-- backfill acima só corrigiria os itens que já existem e os próximos voltariam a ficar sem margem.
ALTER TABLE "ProductionItem" ALTER COLUMN "margemSeguranca" SET DEFAULT 10;

-- Setores padrão (antes só entravam pelo seed, que não roda no deploy): sem eles o seletor de
-- setor e o filtro de "Produção de Hoje" ficariam vazios logo após publicar. Mesmas keys do seed
-- (prisma/seed.ts), então rodar o seed depois apenas atualiza, nunca duplica.
INSERT INTO "ProductionSetor" ("id", "key", "name", "color", "icon", "order", "active", "updatedAt")
VALUES
  ('setor_cozinha_quente', 'cozinha-quente', 'Cozinha Quente', '#f97316', 'Flame', 0, true, CURRENT_TIMESTAMP),
  ('setor_cozinha_fria', 'cozinha-fria', 'Cozinha Fria', '#38bdf8', 'Snowflake', 1, true, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
