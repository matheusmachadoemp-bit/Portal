UPDATE "Subcategory" SET "key" = 'instagram-organico', "name" = 'Instagram Orgânico', "icon" = 'Instagram'
WHERE "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'marketing') AND "key" = 'redes-sociais';

UPDATE "Subcategory" SET "key" = 'meta-ads', "name" = 'Meta Ads', "icon" = 'Megaphone'
WHERE "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'marketing') AND "key" = 'trafego-pago';

INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "color", "order", "active", "isSystem", "createdAt", "updatedAt")
SELECT 'marketing-google-ads', "id", 'google-ads', 'Google Ads', 'Search', '#2952E3', 8, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Category" WHERE "key" = 'marketing' ON CONFLICT ("categoryId", "key") DO NOTHING;

UPDATE "Subcategory"
SET "order" = CASE "key"
  WHEN 'instagram-organico' THEN 6
  WHEN 'meta-ads' THEN 7
  WHEN 'google-ads' THEN 8
  WHEN 'equipe' THEN 9
  WHEN 'relatorios' THEN 10
  ELSE "order"
END
WHERE "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'marketing');
