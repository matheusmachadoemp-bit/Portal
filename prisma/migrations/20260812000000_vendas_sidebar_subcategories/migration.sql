-- Adiciona as subcategorias de Vendas ao menu lateral (sidebar), no lugar
-- das abas que existiam apenas no topo da página. Idempotente: só insere
-- as que ainda não existirem para a categoria "vendas".
INSERT INTO "Subcategory" (id, "categoryId", key, name, icon, "order", "isSystem", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c.id, s.key, s.name, s.icon, s.ord, true, now(), now()
FROM "Category" c
JOIN (VALUES
  ('lancamentos', 'Lançamentos', 'ReceiptText', 0),
  ('itens-vendidos', 'Curva ABC', 'BarChart3', 1),
  ('garcons', 'Desempenho por Garçom', 'Users', 2),
  ('por-hora', 'Vendas por Hora', 'Clock', 3),
  ('periodo', 'Vendas por Período', 'CalendarRange', 4),
  ('pagamento', 'Forma de Pagamento', 'CreditCard', 5),
  ('entrega', 'Área de Entrega', 'MapPin', 6)
) AS s(key, name, icon, ord) ON true
WHERE c.key = 'vendas'
  AND NOT EXISTS (
    SELECT 1 FROM "Subcategory" existing
    WHERE existing."categoryId" = c.id AND existing.key = s.key
  );
