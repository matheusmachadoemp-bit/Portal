-- Cria a categoria "Loja Nord" e suas subcategorias no menu lateral.
-- Idêntico ao bloco adicionado em prisma/seed.ts (mesmas keys/labels/ícones),
-- só que aplicado automaticamente no deploy (via `prisma migrate deploy`) em
-- vez de depender de rodar `npm run db:seed` manualmente em produção.
-- ON CONFLICT DO NOTHING torna isso seguro mesmo se o seed também rodar.

INSERT INTO "Category" ("id", "key", "name", "icon", "order", "active", "isSystem", "contentType", "createdAt", "updatedAt")
VALUES ('02c2cbaf-7510-4703-a164-da144d99fc44', 'loja-nord', 'Loja Nord', 'Gift', 16, true, true, 'loja-nord', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "order", "active", "isSystem", "createdAt", "updatedAt")
VALUES
  ('a16ab32f-0c1d-40d1-877c-321227055f8a', '02c2cbaf-7510-4703-a164-da144d99fc44', 'loja', 'Loja', 'ShoppingBag', 0, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('864de200-db5a-466f-b434-a40461c50bfa', '02c2cbaf-7510-4703-a164-da144d99fc44', 'meus-pontos', 'Meus Pontos', 'Coins', 1, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('2bc1c92d-bf14-42b4-bee2-6a20671be281', '02c2cbaf-7510-4703-a164-da144d99fc44', 'ranking', 'Ranking', 'Trophy', 2, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('4bc48c96-6920-4279-bf55-7edb0b551555', '02c2cbaf-7510-4703-a164-da144d99fc44', 'meus-resgates', 'Meus Resgates', 'PackageCheck', 3, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('9aeea014-a5e3-41e9-ac0d-1a48a81ea585', '02c2cbaf-7510-4703-a164-da144d99fc44', 'gestao', 'Gestão', 'Settings', 4, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('5cb1a156-7c82-4dbf-9c2e-95c091f82165', '02c2cbaf-7510-4703-a164-da144d99fc44', 'regras', 'Regras de Pontuação', 'BookOpen', 5, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("categoryId", "key") DO NOTHING;
