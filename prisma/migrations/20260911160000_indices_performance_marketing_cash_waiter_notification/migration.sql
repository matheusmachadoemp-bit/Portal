-- Índices faltando em tabelas que crescem por transação/evento e já são
-- filtradas por empresaId (ou userId) + ordenadas por data em telas visitadas
-- com muita frequência — mesmo padrão de SalesEntry (empresaId, date), que já
-- tinha índice, mas passou batido nestas quatro. Achado investigando o
-- relato "todas as telas estão lentas": nenhuma dessas consultas tinha índice
-- que cobrisse o filtro + a ordenação, então cada chamada fazia sequential
-- scan + sort na tabela inteira.

-- MarketingEntry: Tela de Início (todo mundo, a cada carregamento) e
-- Marketing > Tráfego pago/Redes sociais buscam `where empresaId in (...)
-- order by date desc`.
-- CreateIndex
CREATE INDEX "MarketingEntry_empresaId_date_idx" ON "MarketingEntry"("empresaId", "date");

-- CashMovement: Financeiro > Caixa da empresa busca `where empresaId in (...)
-- order by date desc take 200`.
-- CreateIndex
CREATE INDEX "CashMovement_empresaId_date_idx" ON "CashMovement"("empresaId", "date");

-- WaiterSaleEntry: Metas > Venda acumulada busca `where empresaId in (...)
-- order by date desc`.
-- CreateIndex
CREATE INDEX "WaiterSaleEntry_empresaId_date_idx" ON "WaiterSaleEntry"("empresaId", "date");

-- Notification: o sino de notificações (GET /api/notificacoes) busca as 30
-- mais recentes de cada usuário (`where userId order by createdAt desc take
-- 30`) a cada 60s, para toda sessão logada — roda o tempo todo em segundo
-- plano. O índice existente (userId, read) cobre só a contagem de não lidas,
-- não esse orderBy.
-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
