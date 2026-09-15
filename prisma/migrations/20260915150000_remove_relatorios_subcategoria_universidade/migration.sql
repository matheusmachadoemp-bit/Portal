-- A pedido do usuário (item 9 de uma lista de atualizações): remove do menu
-- lateral a subcategoria "Relatórios" da categoria "Universidade Grupo
-- Nord". A tela (src/app/portal/universidade/relatorios/page.tsx) e a rota
-- de API que ela consumia (src/app/api/university/export/route.ts, sem
-- outro consumidor no app) foram removidas por completo nesta mesma leva de
-- atualizações. Mesmo padrão de hard delete já usado em
-- prisma/migrations/20260915120000_remove_relatorios_subcategoria_manutencao/migration.sql.
--
-- Importante: NÃO mexe nas outras subcategorias "relatorios" (Manutenção,
-- Financeiro, Estoque, CRM) — cada uma pertence à sua própria categoria e
-- continua existindo normalmente. Nenhum model próprio existia para os
-- relatórios de Universidade (a tela apenas agregava dados de
-- TrainingEnrollment, TrainingCertificate e TrainingXpEvent para exportação
-- em CSV), então nenhuma tabela de dados é afetada por esta migration.
DELETE FROM "Subcategory"
WHERE key = 'relatorios'
  AND "categoryId" = (SELECT id FROM "Category" WHERE key = 'universidade');
