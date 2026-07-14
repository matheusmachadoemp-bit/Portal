-- Portal Nord — script de inicialização para colar no SQL Editor do Neon
-- (rode isso DEPOIS de já ter aplicado as migrações do Prisma / criado as tabelas)

-- Usuários de acesso
INSERT INTO "User" (id, name, email, "passwordHash", role, active, "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'Administrador Nord', 'admin@nordpizza.com', '$2b$10$n6j3mtJoF0lwROziBQ2.l.jz3WEH4ZEBXtWcGF4dVlTvXH1acd55.', 'ADMINISTRADOR', true, now(), now()),
  (gen_random_uuid()::text, 'Gerente Nord', 'gerente@nordpizza.com', '$2b$10$YR397qOaUONMIPPOWU0c..ZLZHFjz98xJWHLEynTSjxrRkd0ehp/u', 'GERENTE', true, now(), now());

-- Categorias do menu
INSERT INTO "Category" (id, key, name, icon, "order", "isSystem", "contentType", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'inicio', 'Início', 'Home', 0, true, 'dashboard', now(), now()),
  (gen_random_uuid()::text, 'vendas', 'Vendas', 'ShoppingCart', 1, true, 'vendas', now(), now()),
  (gen_random_uuid()::text, 'marketing', 'Marketing', 'Megaphone', 2, true, 'marketing', now(), now()),
  (gen_random_uuid()::text, 'metas', 'Metas', 'Target', 3, true, 'metas', now(), now()),
  (gen_random_uuid()::text, 'rh', 'RH', 'Users', 4, true, 'rh', now(), now()),
  (gen_random_uuid()::text, 'administrativo', 'Administrativo', 'Building2', 5, true, 'administrativo', now(), now()),
  (gen_random_uuid()::text, 'ficha-tecnica', 'Ficha Técnica', 'ClipboardList', 6, true, 'ficha-tecnica', now(), now()),
  (gen_random_uuid()::text, 'configuracoes', 'Configurações', 'Settings', 7, true, 'configuracoes', now(), now()),
  (gen_random_uuid()::text, 'usuarios', 'Usuários', 'UserCog', 8, true, 'usuarios', now(), now());

-- Subcategorias de Metas
INSERT INTO "Subcategory" (id, "categoryId", key, name, icon, "order", "isSystem", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c.id, s.key, s.name, s.icon, s.ord, true, now(), now()
FROM "Category" c
JOIN (VALUES
  ('gerencia', 'Metas da Gerência', 'Briefcase', 0),
  ('salao', 'Metas do Salão', 'Utensils', 1),
  ('cozinha', 'Metas da Cozinha', 'ChefHat', 2),
  ('delivery', 'Metas do Delivery', 'Bike', 3)
) AS s(key, name, icon, ord) ON true
WHERE c.key = 'metas';

-- Subcategorias de RH
INSERT INTO "Subcategory" (id, "categoryId", key, name, icon, "order", "isSystem", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c.id, s.key, s.name, s.icon, s.ord, true, now(), now()
FROM "Category" c
JOIN (VALUES
  ('colaboradores', 'Colaboradores', 'IdCard', 0),
  ('ocorrencias', 'Ocorrências', 'AlertTriangle', 1)
) AS s(key, name, icon, ord) ON true
WHERE c.key = 'rh';

-- Subcategorias de Administrativo
INSERT INTO "Subcategory" (id, "categoryId", key, name, icon, "order", "isSystem", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c.id, s.key, s.name, s.icon, s.ord, true, now(), now()
FROM "Category" c
JOIN (VALUES
  ('senhas', 'Senhas', 'KeyRound', 0),
  ('cursos', 'Cursos', 'GraduationCap', 1),
  ('cartilhas', 'Cartilhas', 'BookOpen', 2),
  ('logo', 'Logo', 'Image', 3),
  ('arquivos', 'Arquivos', 'FolderOpen', 4)
) AS s(key, name, icon, ord) ON true
WHERE c.key = 'administrativo';

-- Subcategorias de Ficha Técnica
INSERT INTO "Subcategory" (id, "categoryId", key, name, icon, "order", "isSystem", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c.id, s.key, s.name, s.icon, s.ord, true, now(), now()
FROM "Category" c
JOIN (VALUES
  ('pizzas-salgadas', 'Pizzas Salgadas', 'Pizza', 0),
  ('pizzas-doces', 'Pizzas Doces', 'Pizza', 1),
  ('combos', 'Combos', 'Package', 2),
  ('esfihas-salgadas', 'Esfihas Salgadas', 'Sandwich', 3),
  ('esfihas-doces', 'Esfihas Doces', 'Sandwich', 4),
  ('acompanhamentos', 'Acompanhamentos', 'Soup', 5),
  ('burgers', 'Burgers', 'Beef', 6),
  ('bebidas', 'Bebidas', 'CupSoda', 7),
  ('drinks', 'Drinks', 'Martini', 8),
  ('insumos', 'Insumos', 'Boxes', 9)
) AS s(key, name, icon, ord) ON true
WHERE c.key = 'ficha-tecnica';
