-- Adiciona as subcategorias de Marketing ao menu lateral (sidebar), no lugar
-- das abas que existiam apenas no topo da página. Idempotente: só insere
-- as que ainda não existirem para a categoria "marketing".
INSERT INTO "Subcategory" (id, "categoryId", key, name, icon, "order", "isSystem", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c.id, s.key, s.name, s.icon, s.ord, true, now(), now()
FROM "Category" c
JOIN (VALUES
  ('calendario', 'Calendário de Conteúdo', 'CalendarDays', 0),
  ('tarefas', 'Tarefas', 'ListTodo', 1),
  ('campanhas', 'Campanhas', 'Megaphone', 2),
  ('biblioteca', 'Biblioteca de Arquivos', 'FolderOpen', 3),
  ('drive', 'Google Drive', 'HardDrive', 4),
  ('ideias', 'Banco de Ideias', 'Sparkles', 5),
  ('trafego-pago', 'Tráfego Pago', 'TrendingUp', 6),
  ('redes-sociais', 'Redes Sociais', 'Share2', 7),
  ('equipe', 'Equipe', 'Users', 8),
  ('relatorios', 'Relatórios', 'FileBarChart', 9)
) AS s(key, name, icon, ord) ON true
WHERE c.key = 'marketing'
  AND NOT EXISTS (
    SELECT 1 FROM "Subcategory" existing
    WHERE existing."categoryId" = c.id AND existing.key = s.key
  );
