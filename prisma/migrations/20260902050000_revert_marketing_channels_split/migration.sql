-- Reverte a divisão Instagram Orgânico / Meta Ads / Google Ads: remove os
-- itens de menu criados por ela, mantendo "trafego-pago" e "redes-sociais"
-- que já existiam antes (evita colidir com a constraint de unicidade
-- categoryId+key caso os dois conjuntos coexistam em produção).
DELETE FROM "Subcategory"
WHERE "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'marketing')
  AND "key" IN ('instagram-organico', 'meta-ads', 'google-ads');

UPDATE "Subcategory" SET "name" = 'Tráfego Pago', "icon" = 'TrendingUp'
WHERE "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'marketing') AND "key" = 'trafego-pago';

UPDATE "Subcategory" SET "name" = 'Redes Sociais', "icon" = 'Share2'
WHERE "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'marketing') AND "key" = 'redes-sociais';

UPDATE "Subcategory"
SET "order" = CASE "key"
  WHEN 'dashboard' THEN 0
  WHEN 'calendario' THEN 1
  WHEN 'tarefas' THEN 2
  WHEN 'campanhas' THEN 3
  WHEN 'parcerias' THEN 4
  WHEN 'biblioteca' THEN 5
  WHEN 'ideias' THEN 6
  WHEN 'trafego-pago' THEN 7
  WHEN 'redes-sociais' THEN 8
  WHEN 'equipe' THEN 9
  WHEN 'relatorios' THEN 10
  ELSE "order"
END
WHERE "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'marketing');
