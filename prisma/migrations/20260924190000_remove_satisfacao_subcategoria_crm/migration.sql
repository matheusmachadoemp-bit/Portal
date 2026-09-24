-- Decisão #1 do módulo "Satisfação do Cliente" (já validada com o Matheus, ver
-- docs/satisfacao-cliente-proposta.md): aposentar a página CRM > Satisfação/NPS assim que o
-- módulo novo estiver pronto, migrando os widgets que liam de NpsResponse (Início,
-- dashboard do CRM) para lerem de CustomerSurveyResponse — feito nesta mesma atualização
-- (ver src/lib/inicio.ts / src/lib/crm-dashboard.ts).
--
-- Remove só a SUBCATEGORIA (menu lateral). NÃO remove o model `NpsResponse`, a rota
-- `POST /api/crm/nps` nem a página `src/app/portal/crm/satisfacao/` — os dados antigos ficam
-- preservados como histórico (decisão explícita do Matheus: sem migração de dado pro módulo
-- novo), só deixam de ter link no menu.
--
-- Mesmo padrão de hard delete já usado nas remoções anteriores de subcategoria do CRM — ver
-- prisma/migrations/20260924150000_remove_segmentos_relatorios_subcategoria_crm/migration.sql.
DELETE FROM "Subcategory"
WHERE key = 'satisfacao'
  AND "categoryId" = (SELECT id FROM "Category" WHERE key = 'crm');
