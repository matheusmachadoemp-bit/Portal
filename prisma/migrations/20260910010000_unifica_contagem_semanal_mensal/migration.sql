-- Unifica as subcategorias "Contagem Semanal" e "Contagem Mensal" (Estoque)
-- numa só ("Contagem de Estoque"), já que as duas telas agora vivem numa
-- única página com abas internas (Semanal/Mensal), em vez de duas entradas
-- separadas no menu lateral.
UPDATE "Subcategory"
SET key = 'contagem', name = 'Contagem de Estoque', icon = 'ClipboardCheck', "updatedAt" = CURRENT_TIMESTAMP
WHERE key = 'contagem-semanal'
  AND "categoryId" = (SELECT id FROM "Category" WHERE key = 'estoque');

DELETE FROM "Subcategory"
WHERE key = 'contagem-mensal'
  AND "categoryId" = (SELECT id FROM "Category" WHERE key = 'estoque');
