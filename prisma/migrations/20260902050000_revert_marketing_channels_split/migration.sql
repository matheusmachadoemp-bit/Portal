UPDATE "Subcategory" SET "key" = 'redes-sociais', "name" = 'Redes Sociais', "icon" = 'Share2'
WHERE "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'marketing') AND "key" = 'instagram-organico';

UPDATE "Subcategory" SET "key" = 'trafego-pago', "name" = 'Tráfego Pago', "icon" = 'TrendingUp'
WHERE "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'marketing') AND "key" = 'meta-ads';

DELETE FROM "Subcategory"
WHERE "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'marketing') AND "key" = 'google-ads';

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
