-- Redesenho de Metas (Fase 1 — dado/API, tela fica pra depois): cada
-- subcategoria (Gerência/Salão/Cozinha/Delivery/Marketing/Administrativo) já
-- tinha autonomia pra criar suas próprias metas (o botão "Nova meta" de
-- src/app/portal/metas/[sub] já cria direto na categoria daquela tela); o
-- que muda aqui é COMO o "valor realizado" do mês é formado: em vez de um
-- número único editado direto em `Goal.valorRealizado`, cada semana do mês
-- da meta agora tem seu próprio lançamento (`GoalWeeklyUpdate`), e o sistema
-- soma todos os lançamentos da meta pra chegar no valor do mês —
-- `Goal.valorRealizado` continua existindo, mas agora é um cache sempre
-- igual a essa soma (ver `recomputeGoalRealizado` em
-- src/lib/goals-server.ts), nunca mais editado direto pelas rotas de
-- criar/editar meta.
--
-- NOTA (fora do escopo desta migration, mesmo drift pré-existente já
-- documentado em 20260915181816_reuniao_gerente_metas_proximo_mes e
-- reconfirmado em 20260916023001_meta_proximo_mes_meeting_key): o diff
-- gerado por `prisma migrate dev` trouxe de novo 3 DropForeignKey/
-- AddForeignKey em Sale/SalesEntry/MarketingEntry.createdById (RESTRICT ->
-- SET NULL) e 1 RenameIndex em MetaAdsInsight, sem nenhuma relação com
-- Metas. Removidos deste arquivo pelo mesmo motivo de sempre: não é assunto
-- desta migration.

-- CreateTable
CREATE TABLE "GoalWeeklyUpdate" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "observacao" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoalWeeklyUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoalWeeklyUpdate_goalId_idx" ON "GoalWeeklyUpdate"("goalId");

-- CreateIndex
CREATE UNIQUE INDEX "GoalWeeklyUpdate_goalId_weekNumber_key" ON "GoalWeeklyUpdate"("goalId", "weekNumber");

-- AddForeignKey
ALTER TABLE "GoalWeeklyUpdate" ADD CONSTRAINT "GoalWeeklyUpdate_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalWeeklyUpdate" ADD CONSTRAINT "GoalWeeklyUpdate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Migração de dado: toda `Goal` já cadastrada até aqui tem um
-- `valorRealizado` acumulado, mas nenhum lançamento semanal (a tabela é
-- nova). Sem um jeito de saber quais semanas formaram esse total no passado,
-- a estratégia que preserva o dado sem inventar informação que não temos é:
-- 1 lançamento por meta, na semana 1, com o valor total que a meta já tinha
-- — inclusive metas com valorRealizado = 0 (mantém 1:1 com todas as metas
-- existentes, sem criar um caso especial silencioso, mesmo padrão já usado
-- em 20260915140000_marketing_partner_entries pra MarketingPartnerEntry).
-- Depois deste INSERT, `Goal.valorRealizado` continua batendo exatamente com
-- a soma dos lançamentos semanais de cada meta (aqui, sempre só o lançamento
-- da semana 1) — nenhuma meta muda de valor, status ou progresso.
INSERT INTO "GoalWeeklyUpdate" (
    "id", "goalId", "weekNumber", "valor", "observacao", "createdById", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    "id",
    1,
    "valorRealizado",
    'Valor migrado automaticamente do total acumulado antes das atualizações semanais.',
    "createdById",
    "createdAt",
    CURRENT_TIMESTAMP
FROM "Goal";
