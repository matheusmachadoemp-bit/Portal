-- Migration de dado puro (sem alteração de schema) — cria o currículo completo
-- de onboarding na Universidade Grupo Nord: 10 TrainingCourse (cada um com
-- seus TrainingModule, na ordem certa) e 1 TrainingTrack ("Trilha de
-- Onboarding") linkando os 10 cursos em sequência via TrainingTrackCourse.
--
-- Conteúdo pedido pelo usuário (tabela de 10 categorias x várias aulas cada).
-- Todos os 10 cursos nascem em status RASCUNHO: a tabela só definiu nome das
-- aulas e duração sugerida, sem nenhum vídeo/conteúdo de verdade — publicar
-- cursos vazios seria uma experiência ruim. Um admin publica pela tela de
-- Universidade (course-builder-modal) depois de anexar o conteúdo real.
--
-- category = 'Onboarding' (novo valor de COURSE_CATEGORY_OPTIONS em
-- src/lib/university.ts, adicionado junto desta migration) agrupa os 10 como
-- um filtro único no catálogo. empresaId = NULL em tudo: é conteúdo do Grupo
-- Nord inteiro, não de uma loja só.
--
-- mandatory = true nos 10 cursos: decisão deste migration (não estava
-- explícita no pedido) — é conteúdo de onboarding, isto é, por definição
-- obrigatório para todo novo colaborador. Conferido em
-- src/app/portal/universidade/gestor/page.tsx e src/lib/inicio.ts: essa
-- flag só alimenta um contador de "matrícula obrigatória atrasada" a partir
-- de TrainingEnrollment já existentes e um badge "Obrigatório" no catálogo —
-- não cria matrícula automática nem afeta nada enquanto o curso continuar
-- RASCUNHO/sem ninguém matriculado, então é uma mudança segura de reverter
-- se o usuário discordar.
--
-- cargaHoraria: apesar do nome (e do schema.prisma não deixar isso óbvio),
-- essa coluna é tratada pelo resto do app como MINUTOS, não horas — ver
-- label real "Carga horária (minutos)" em course-builder-modal.tsx e a conta
-- `Math.floor(certificate.cargaHoraria / 60)` em
-- src/app/certificado/[code]/page.tsx. Por isso, para os cursos 1-8, é a
-- soma dos minutos das aulas daquele curso; no curso 9 é 0 (duração
-- "variável", sem número real); no curso 10 é 15 (extremo superior do range
-- "10-15 min" dado só para o item 1, os outros dois itens não têm número).
--
-- IDs: cuid() do Prisma é gerado client-side (sem DEFAULT no banco — ver
-- CreateTable original em
-- prisma/migrations/20260810222805_universidade_grupo_nord/migration.sql),
-- por isso todo INSERT abaixo fornece o id explicitamente. Cursos e a trilha
-- usam um UUID fixo, escrito diretamente no SQL (mesmo padrão já usado em
-- 20260905053100_loja_nord_menu/migration.sql), porque o id precisa ser
-- referenciado de novo mais abaixo (módulos apontam para o courseId; a
-- trilha aponta para os 10 courseIds) — como é o mesmo literal em toda
-- reexecução deste arquivo, isso funciona tanto na primeira aplicação quanto
-- num rerun (quando o INSERT do curso já não faz nada por causa do
-- ON CONFLICT, o literal ainda aponta pra linha certa, já existente). Módulos,
-- a linha de trilha-curso e o quiz não precisam disso (nada os referencia
-- depois), então usam gen_random_uuid()::text.
--
-- createdById (FK obrigatória em TrainingCourse -> User): não temos acesso
-- direto ao banco de produção pra saber o id de um usuário admin real, então
-- resolvemos via subquery pelo ADMINISTRADOR mais antigo cadastrado — deve
-- sempre existir pelo menos um, já que é exigido para o próprio sistema
-- funcionar. Com COALESCE caindo pro usuário mais antigo de qualquer cargo
-- caso, por algum motivo, não haja nenhum ADMINISTRADOR: sem esse fallback,
-- um banco (hipotético) sem nenhum ADMINISTRADOR faria essa subquery
-- resolver NULL, o que violaria a constraint NOT NULL de createdById e
-- travaria esta migration com erro P3018 — que bloqueia inclusive qualquer
-- migration seguinte até alguém rodar `prisma migrate resolve` manualmente
-- (confirmado testando este arquivo com `prisma migrate deploy` contra um
-- banco só com o schema aplicado, sem nenhum usuário: sem o COALESCE, falha
-- exatamente assim). Numa produção real, que já tem usuários há meses, a
-- subquery do ADMINISTRADOR mais antigo é a que deve resolver de fato — o
-- fallback é só uma rede de segurança.
--
-- Idempotência: TrainingCourse.slug e TrainingTrack.key são @unique, então
-- usam ON CONFLICT DO NOTHING. TrainingTrackCourse tem @@unique([trackId,
-- courseId]) e TrainingQuiz tem courseId @unique, idem. TrainingModule NÃO
-- tem nenhuma unique key própria (nem em courseId+title, nem courseId+order)
-- — por isso cada bloco de INSERT de módulos é condicionado a
-- "WHERE NOT EXISTS (SELECT 1 FROM TrainingModule WHERE courseId = X)": se o
-- curso já tem módulos (seja da primeira aplicação desta migration, seja de
-- edição manual), a segunda execução não insere nada de novo.

-- ---------------------------------------------------------------------------
-- Curso 1 — "👋 1. Bem-vindo à empresa"
-- ---------------------------------------------------------------------------
INSERT INTO "TrainingCourse" (
  "id", "name", "slug", "category", "description", "cargo", "empresaId",
  "imageUrl", "instructor", "cargaHoraria", "status", "mandatory", "version",
  "order", "createdById", "createdAt", "updatedAt"
)
VALUES (
  'db795485-7e85-40cc-aa31-b20c39e9ba36', '👋 1. Bem-vindo à empresa', 'onboarding-bem-vindo-a-empresa',
  'Onboarding', NULL, NULL, NULL, NULL, NULL, 26, 'RASCUNHO'::"CourseStatus", true, 1, 1,
  COALESCE(
    (SELECT "id" FROM "User" WHERE "role" = 'ADMINISTRADOR' ORDER BY "createdAt" ASC LIMIT 1),
    (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
  ),
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "TrainingModule" ("id", "courseId", "title", "type", "durationSeconds", "order", "createdAt", "updatedAt")
SELECT * FROM (VALUES
  (gen_random_uuid()::text, 'db795485-7e85-40cc-aa31-b20c39e9ba36', 'Bem-vindo à Nord/Zarki', 'VIDEO'::"ModuleType", 240, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'db795485-7e85-40cc-aa31-b20c39e9ba36', 'Nossa história', 'VIDEO'::"ModuleType", 300, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'db795485-7e85-40cc-aa31-b20c39e9ba36', 'Cultura, propósito e valores', 'VIDEO'::"ModuleType", 360, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'db795485-7e85-40cc-aa31-b20c39e9ba36', 'Como a loja funciona', 'VIDEO'::"ModuleType", 360, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'db795485-7e85-40cc-aa31-b20c39e9ba36', 'Conhecendo os setores', 'VIDEO'::"ModuleType", 300, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
) AS v("id", "courseId", "title", "type", "durationSeconds", "order", "createdAt", "updatedAt")
WHERE NOT EXISTS (SELECT 1 FROM "TrainingModule" WHERE "courseId" = 'db795485-7e85-40cc-aa31-b20c39e9ba36');

-- ---------------------------------------------------------------------------
-- Curso 2 — "📋 2. Minha vida na empresa"
-- ---------------------------------------------------------------------------
INSERT INTO "TrainingCourse" (
  "id", "name", "slug", "category", "description", "cargo", "empresaId",
  "imageUrl", "instructor", "cargaHoraria", "status", "mandatory", "version",
  "order", "createdById", "createdAt", "updatedAt"
)
VALUES (
  '87b03fb2-8945-4cb0-b85f-bf10de8315fc', '📋 2. Minha vida na empresa', 'onboarding-minha-vida-na-empresa',
  'Onboarding', NULL, NULL, NULL, NULL, NULL, 32, 'RASCUNHO'::"CourseStatus", true, 1, 2,
  COALESCE(
    (SELECT "id" FROM "User" WHERE "role" = 'ADMINISTRADOR' ORDER BY "createdAt" ASC LIMIT 1),
    (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
  ),
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "TrainingModule" ("id", "courseId", "title", "type", "durationSeconds", "order", "createdAt", "updatedAt")
SELECT * FROM (VALUES
  (gen_random_uuid()::text, '87b03fb2-8945-4cb0-b85f-bf10de8315fc', 'Jornada e horário de trabalho', 'VIDEO'::"ModuleType", 300, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '87b03fb2-8945-4cb0-b85f-bf10de8315fc', 'Como funcionam salário e pagamento', 'VIDEO'::"ModuleType", 300, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '87b03fb2-8945-4cb0-b85f-bf10de8315fc', 'Folgas e escala', 'VIDEO'::"ModuleType", 300, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '87b03fb2-8945-4cb0-b85f-bf10de8315fc', 'Férias e benefícios aplicáveis', 'VIDEO'::"ModuleType", 300, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '87b03fb2-8945-4cb0-b85f-bf10de8315fc', 'Ponto: entrada, saída e intervalo', 'VIDEO'::"ModuleType", 300, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '87b03fb2-8945-4cb0-b85f-bf10de8315fc', 'Uniforme e apresentação pessoal', 'VIDEO'::"ModuleType", 240, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '87b03fb2-8945-4cb0-b85f-bf10de8315fc', 'Quem procurar quando tiver dúvidas', 'VIDEO'::"ModuleType", 180, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
) AS v("id", "courseId", "title", "type", "durationSeconds", "order", "createdAt", "updatedAt")
WHERE NOT EXISTS (SELECT 1 FROM "TrainingModule" WHERE "courseId" = '87b03fb2-8945-4cb0-b85f-bf10de8315fc');

-- ---------------------------------------------------------------------------
-- Curso 3 — "⚖️ 3. Regras da empresa"
-- ---------------------------------------------------------------------------
INSERT INTO "TrainingCourse" (
  "id", "name", "slug", "category", "description", "cargo", "empresaId",
  "imageUrl", "instructor", "cargaHoraria", "status", "mandatory", "version",
  "order", "createdById", "createdAt", "updatedAt"
)
VALUES (
  '212631c5-5482-4363-ae8f-ca00e688ffd3', '⚖️ 3. Regras da empresa', 'onboarding-regras-da-empresa',
  'Onboarding', NULL, NULL, NULL, NULL, NULL, 32, 'RASCUNHO'::"CourseStatus", true, 1, 3,
  COALESCE(
    (SELECT "id" FROM "User" WHERE "role" = 'ADMINISTRADOR' ORDER BY "createdAt" ASC LIMIT 1),
    (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
  ),
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "TrainingModule" ("id", "courseId", "title", "type", "durationSeconds", "order", "createdAt", "updatedAt")
SELECT * FROM (VALUES
  (gen_random_uuid()::text, '212631c5-5482-4363-ae8f-ca00e688ffd3', 'Regulamento interno', 'VIDEO'::"ModuleType", 480, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '212631c5-5482-4363-ae8f-ca00e688ffd3', 'Faltas, atrasos e atestados', 'VIDEO'::"ModuleType", 360, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '212631c5-5482-4363-ae8f-ca00e688ffd3', 'Uso de celular', 'VIDEO'::"ModuleType", 180, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '212631c5-5482-4363-ae8f-ca00e688ffd3', 'Alimentação dos colaboradores', 'VIDEO'::"ModuleType", 240, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '212631c5-5482-4363-ae8f-ca00e688ffd3', 'Uso de equipamentos e patrimônio', 'VIDEO'::"ModuleType", 300, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '212631c5-5482-4363-ae8f-ca00e688ffd3', 'Condutas proibidas e medidas disciplinares', 'VIDEO'::"ModuleType", 360, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
) AS v("id", "courseId", "title", "type", "durationSeconds", "order", "createdAt", "updatedAt")
WHERE NOT EXISTS (SELECT 1 FROM "TrainingModule" WHERE "courseId" = '212631c5-5482-4363-ae8f-ca00e688ffd3');

-- ---------------------------------------------------------------------------
-- Curso 4 — "🤝 4. Cultura e comportamento"
-- ---------------------------------------------------------------------------
INSERT INTO "TrainingCourse" (
  "id", "name", "slug", "category", "description", "cargo", "empresaId",
  "imageUrl", "instructor", "cargaHoraria", "status", "mandatory", "version",
  "order", "createdById", "createdAt", "updatedAt"
)
VALUES (
  'a8b33f28-f3cf-4fd3-a8b7-bc4064aff2f1', '🤝 4. Cultura e comportamento', 'onboarding-cultura-e-comportamento',
  'Onboarding', NULL, NULL, NULL, NULL, NULL, 24, 'RASCUNHO'::"CourseStatus", true, 1, 4,
  COALESCE(
    (SELECT "id" FROM "User" WHERE "role" = 'ADMINISTRADOR' ORDER BY "createdAt" ASC LIMIT 1),
    (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
  ),
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "TrainingModule" ("id", "courseId", "title", "type", "durationSeconds", "order", "createdAt", "updatedAt")
SELECT * FROM (VALUES
  (gen_random_uuid()::text, 'a8b33f28-f3cf-4fd3-a8b7-bc4064aff2f1', 'Como esperamos que você se comporte', 'VIDEO'::"ModuleType", 300, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'a8b33f28-f3cf-4fd3-a8b7-bc4064aff2f1', 'Respeito entre colaboradores', 'VIDEO'::"ModuleType", 300, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'a8b33f28-f3cf-4fd3-a8b7-bc4064aff2f1', 'Comunicação e trabalho em equipe', 'VIDEO'::"ModuleType", 300, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'a8b33f28-f3cf-4fd3-a8b7-bc4064aff2f1', 'Como resolver conflitos', 'VIDEO'::"ModuleType", 300, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'a8b33f28-f3cf-4fd3-a8b7-bc4064aff2f1', 'Liderança: quem responde por quem', 'VIDEO'::"ModuleType", 240, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
) AS v("id", "courseId", "title", "type", "durationSeconds", "order", "createdAt", "updatedAt")
WHERE NOT EXISTS (SELECT 1 FROM "TrainingModule" WHERE "courseId" = 'a8b33f28-f3cf-4fd3-a8b7-bc4064aff2f1');

-- ---------------------------------------------------------------------------
-- Curso 5 — "❤️ 5. Experiência do cliente"
-- ---------------------------------------------------------------------------
INSERT INTO "TrainingCourse" (
  "id", "name", "slug", "category", "description", "cargo", "empresaId",
  "imageUrl", "instructor", "cargaHoraria", "status", "mandatory", "version",
  "order", "createdById", "createdAt", "updatedAt"
)
VALUES (
  '9a17c1c7-32e4-41b3-a08b-55f228f1d4a0', '❤️ 5. Experiência do cliente', 'onboarding-experiencia-do-cliente',
  'Onboarding', NULL, NULL, NULL, NULL, NULL, 30, 'RASCUNHO'::"CourseStatus", true, 1, 5,
  COALESCE(
    (SELECT "id" FROM "User" WHERE "role" = 'ADMINISTRADOR' ORDER BY "createdAt" ASC LIMIT 1),
    (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
  ),
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "TrainingModule" ("id", "courseId", "title", "type", "durationSeconds", "order", "createdAt", "updatedAt")
SELECT * FROM (VALUES
  (gen_random_uuid()::text, '9a17c1c7-32e4-41b3-a08b-55f228f1d4a0', 'O padrão Nord/Zarki de atendimento', 'VIDEO'::"ModuleType", 420, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '9a17c1c7-32e4-41b3-a08b-55f228f1d4a0', 'Como encantar o cliente', 'VIDEO'::"ModuleType", 360, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '9a17c1c7-32e4-41b3-a08b-55f228f1d4a0', 'Como lidar com reclamações', 'VIDEO'::"ModuleType", 420, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '9a17c1c7-32e4-41b3-a08b-55f228f1d4a0', 'O que nunca fazer na frente do cliente', 'VIDEO'::"ModuleType", 240, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '9a17c1c7-32e4-41b3-a08b-55f228f1d4a0', 'Recuperação de uma experiência ruim', 'VIDEO'::"ModuleType", 360, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
) AS v("id", "courseId", "title", "type", "durationSeconds", "order", "createdAt", "updatedAt")
WHERE NOT EXISTS (SELECT 1 FROM "TrainingModule" WHERE "courseId" = '9a17c1c7-32e4-41b3-a08b-55f228f1d4a0');

-- ---------------------------------------------------------------------------
-- Curso 6 — "🧼 6. Segurança e boas práticas"
-- ---------------------------------------------------------------------------
INSERT INTO "TrainingCourse" (
  "id", "name", "slug", "category", "description", "cargo", "empresaId",
  "imageUrl", "instructor", "cargaHoraria", "status", "mandatory", "version",
  "order", "createdById", "createdAt", "updatedAt"
)
VALUES (
  'd630d994-aa5f-48ca-a07a-a75d56b7aa16', '🧼 6. Segurança e boas práticas', 'onboarding-seguranca-e-boas-praticas',
  'Onboarding', NULL, NULL, NULL, NULL, NULL, 40, 'RASCUNHO'::"CourseStatus", true, 1, 6,
  COALESCE(
    (SELECT "id" FROM "User" WHERE "role" = 'ADMINISTRADOR' ORDER BY "createdAt" ASC LIMIT 1),
    (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
  ),
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "TrainingModule" ("id", "courseId", "title", "type", "durationSeconds", "order", "createdAt", "updatedAt")
SELECT * FROM (VALUES
  (gen_random_uuid()::text, 'd630d994-aa5f-48ca-a07a-a75d56b7aa16', 'Higiene pessoal', 'VIDEO'::"ModuleType", 360, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'd630d994-aa5f-48ca-a07a-a75d56b7aa16', 'Higiene e manipulação de alimentos', 'VIDEO'::"ModuleType", 480, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'd630d994-aa5f-48ca-a07a-a75d56b7aa16', 'Contaminação cruzada e alergênicos', 'VIDEO'::"ModuleType", 420, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'd630d994-aa5f-48ca-a07a-a75d56b7aa16', 'Limpeza e organização', 'VIDEO'::"ModuleType", 360, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'd630d994-aa5f-48ca-a07a-a75d56b7aa16', 'Acidentes e situações de emergência', 'VIDEO'::"ModuleType", 360, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'd630d994-aa5f-48ca-a07a-a75d56b7aa16', 'Segurança no trabalho e EPIs aplicáveis', 'VIDEO'::"ModuleType", 420, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
) AS v("id", "courseId", "title", "type", "durationSeconds", "order", "createdAt", "updatedAt")
WHERE NOT EXISTS (SELECT 1 FROM "TrainingModule" WHERE "courseId" = 'd630d994-aa5f-48ca-a07a-a75d56b7aa16');

-- ---------------------------------------------------------------------------
-- Curso 7 — "🏪 7. Como nossa operação funciona"
-- ---------------------------------------------------------------------------
INSERT INTO "TrainingCourse" (
  "id", "name", "slug", "category", "description", "cargo", "empresaId",
  "imageUrl", "instructor", "cargaHoraria", "status", "mandatory", "version",
  "order", "createdById", "createdAt", "updatedAt"
)
VALUES (
  'd25b2881-6c34-4c4a-b6c7-ca4d5ee37365', '🏪 7. Como nossa operação funciona', 'onboarding-como-nossa-operacao-funciona',
  'Onboarding', NULL, NULL, NULL, NULL, NULL, 38, 'RASCUNHO'::"CourseStatus", true, 1, 7,
  COALESCE(
    (SELECT "id" FROM "User" WHERE "role" = 'ADMINISTRADOR' ORDER BY "createdAt" ASC LIMIT 1),
    (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
  ),
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "TrainingModule" ("id", "courseId", "title", "type", "durationSeconds", "order", "createdAt", "updatedAt")
SELECT * FROM (VALUES
  (gen_random_uuid()::text, 'd25b2881-6c34-4c4a-b6c7-ca4d5ee37365', 'Jornada do pedido dentro da loja', 'VIDEO'::"ModuleType", 480, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'd25b2881-6c34-4c4a-b6c7-ca4d5ee37365', 'Salão', 'VIDEO'::"ModuleType", 300, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'd25b2881-6c34-4c4a-b6c7-ca4d5ee37365', 'Cozinha', 'VIDEO'::"ModuleType", 300, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'd25b2881-6c34-4c4a-b6c7-ca4d5ee37365', 'Delivery', 'VIDEO'::"ModuleType", 300, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'd25b2881-6c34-4c4a-b6c7-ca4d5ee37365', 'Caixa', 'VIDEO'::"ModuleType", 300, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'd25b2881-6c34-4c4a-b6c7-ca4d5ee37365', 'Estoque e recebimento', 'VIDEO'::"ModuleType", 300, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'd25b2881-6c34-4c4a-b6c7-ca4d5ee37365', 'Quem é responsável por cada etapa', 'VIDEO'::"ModuleType", 300, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
) AS v("id", "courseId", "title", "type", "durationSeconds", "order", "createdAt", "updatedAt")
WHERE NOT EXISTS (SELECT 1 FROM "TrainingModule" WHERE "courseId" = 'd25b2881-6c34-4c4a-b6c7-ca4d5ee37365');

-- ---------------------------------------------------------------------------
-- Curso 8 — "🎯 8. Performance e crescimento"
-- ---------------------------------------------------------------------------
INSERT INTO "TrainingCourse" (
  "id", "name", "slug", "category", "description", "cargo", "empresaId",
  "imageUrl", "instructor", "cargaHoraria", "status", "mandatory", "version",
  "order", "createdById", "createdAt", "updatedAt"
)
VALUES (
  '79f23114-676c-410d-8a30-daab52411a37', '🎯 8. Performance e crescimento', 'onboarding-performance-e-crescimento',
  'Onboarding', NULL, NULL, NULL, NULL, NULL, 30, 'RASCUNHO'::"CourseStatus", true, 1, 8,
  COALESCE(
    (SELECT "id" FROM "User" WHERE "role" = 'ADMINISTRADOR' ORDER BY "createdAt" ASC LIMIT 1),
    (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
  ),
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "TrainingModule" ("id", "courseId", "title", "type", "durationSeconds", "order", "createdAt", "updatedAt")
SELECT * FROM (VALUES
  (gen_random_uuid()::text, '79f23114-676c-410d-8a30-daab52411a37', 'Como você será avaliado', 'VIDEO'::"ModuleType", 300, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '79f23114-676c-410d-8a30-daab52411a37', 'Metas e indicadores', 'VIDEO'::"ModuleType", 300, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '79f23114-676c-410d-8a30-daab52411a37', 'Checklists e tarefas', 'VIDEO'::"ModuleType", 300, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '79f23114-676c-410d-8a30-daab52411a37', 'Pontuação e ranking do Portal Nord', 'VIDEO'::"ModuleType", 300, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '79f23114-676c-410d-8a30-daab52411a37', 'Medalhas e reconhecimento', 'VIDEO'::"ModuleType", 240, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '79f23114-676c-410d-8a30-daab52411a37', 'Plano de carreira', 'VIDEO'::"ModuleType", 360, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
) AS v("id", "courseId", "title", "type", "durationSeconds", "order", "createdAt", "updatedAt")
WHERE NOT EXISTS (SELECT 1 FROM "TrainingModule" WHERE "courseId" = '79f23114-676c-410d-8a30-daab52411a37');

-- ---------------------------------------------------------------------------
-- Curso 9 — "🎓 9. Curso da função" (caso especial: 1 módulo só, duração
-- "variável" -> durationSeconds 0, cargaHoraria 0; nota explicativa em
-- description do curso E em content do módulo).
-- ---------------------------------------------------------------------------
INSERT INTO "TrainingCourse" (
  "id", "name", "slug", "category", "description", "cargo", "empresaId",
  "imageUrl", "instructor", "cargaHoraria", "status", "mandatory", "version",
  "order", "createdById", "createdAt", "updatedAt"
)
VALUES (
  'f8854153-6917-473d-9b7d-0e82229d9892', '🎓 9. Curso da função', 'onboarding-curso-da-funcao',
  'Onboarding', 'Conteúdo varia conforme o cargo — a definir por área/função.', NULL, NULL, NULL, NULL, 0,
  'RASCUNHO'::"CourseStatus", true, 1, 9,
  COALESCE(
    (SELECT "id" FROM "User" WHERE "role" = 'ADMINISTRADOR' ORDER BY "createdAt" ASC LIMIT 1),
    (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
  ),
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "TrainingModule" ("id", "courseId", "title", "type", "durationSeconds", "content", "order", "createdAt", "updatedAt")
SELECT * FROM (VALUES
  (gen_random_uuid()::text, 'f8854153-6917-473d-9b7d-0e82229d9892', 'Conteúdo específico do cargo', 'VIDEO'::"ModuleType", 0, 'Conteúdo varia conforme o cargo — a definir por área/função.', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
) AS v("id", "courseId", "title", "type", "durationSeconds", "content", "order", "createdAt", "updatedAt")
WHERE NOT EXISTS (SELECT 1 FROM "TrainingModule" WHERE "courseId" = 'f8854153-6917-473d-9b7d-0e82229d9892');

-- ---------------------------------------------------------------------------
-- Curso 10 — "📝 10. Certificação" (caso especial, estrutura diferente):
--   1. "Prova do onboarding" (10-15 min) -> vira TrainingQuiz vinculado ao
--      curso (não um TrainingModule). Ver decisão detalhada no relatório
--      final: criado SEM perguntas (schema permite: TrainingQuestion[] não
--      exige cardinalidade mínima), com minScore/maxAttempts nos defaults do
--      próprio schema (70/3), para um admin popular as perguntas reais pela
--      aba "Avaliação" do course-builder antes de publicar.
--   2. "Avaliação prática com líder" -> módulo informativo CHECKLIST,
--      durationSeconds 0 (passo presencial/offline, sem duração numérica na
--      tabela original).
--   3. "Termo de conclusão" -> módulo informativo LINK, durationSeconds 0
--      (mesma situação).
-- cargaHoraria do curso = 15 (extremo superior do único número dado, "10-15
-- min" do item 1; os itens 2 e 3 não têm estimativa numérica na tabela).
-- ---------------------------------------------------------------------------
INSERT INTO "TrainingCourse" (
  "id", "name", "slug", "category", "description", "cargo", "empresaId",
  "imageUrl", "instructor", "cargaHoraria", "status", "mandatory", "version",
  "order", "createdById", "createdAt", "updatedAt"
)
VALUES (
  '1c802ecf-3afc-4702-85b4-9293a51295f7', '📝 10. Certificação', 'onboarding-certificacao',
  'Onboarding', NULL, NULL, NULL, NULL, NULL, 15, 'RASCUNHO'::"CourseStatus", true, 1, 10,
  COALESCE(
    (SELECT "id" FROM "User" WHERE "role" = 'ADMINISTRADOR' ORDER BY "createdAt" ASC LIMIT 1),
    (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
  ),
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "TrainingModule" ("id", "courseId", "title", "type", "durationSeconds", "order", "createdAt", "updatedAt")
SELECT * FROM (VALUES
  (gen_random_uuid()::text, '1c802ecf-3afc-4702-85b4-9293a51295f7', 'Avaliação prática com líder', 'CHECKLIST'::"ModuleType", 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '1c802ecf-3afc-4702-85b4-9293a51295f7', 'Termo de conclusão', 'LINK'::"ModuleType", 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
) AS v("id", "courseId", "title", "type", "durationSeconds", "order", "createdAt", "updatedAt")
WHERE NOT EXISTS (SELECT 1 FROM "TrainingModule" WHERE "courseId" = '1c802ecf-3afc-4702-85b4-9293a51295f7');

INSERT INTO "TrainingQuiz" ("id", "courseId", "minScore", "maxAttempts", "timeLimitMinutes")
VALUES (gen_random_uuid()::text, '1c802ecf-3afc-4702-85b4-9293a51295f7', 70, 3, NULL)
ON CONFLICT ("courseId") DO NOTHING;

-- ---------------------------------------------------------------------------
-- Trilha de Onboarding — agrupa os 10 cursos acima em sequência guiada.
-- icon = 'Users' (lucide-react, "boas-vindas"/pessoas) e color = '#22c55e'
-- (--nord-success da paleta do projeto, ver src/app/globals.css).
-- ---------------------------------------------------------------------------
INSERT INTO "TrainingTrack" ("id", "key", "name", "cargo", "empresaId", "description", "icon", "color", "order", "active", "createdAt", "updatedAt")
VALUES (
  'dcdbccac-1e7d-4b09-8ec9-d4e084878eab', 'trilha-onboarding', 'Trilha de Onboarding', NULL, NULL,
  'Sequência guiada para o novo colaborador conhecer a empresa, as regras, a cultura e a operação do Grupo Nord, do primeiro dia até a certificação final.',
  'Users', '#22c55e', 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "TrainingTrackCourse" ("id", "trackId", "courseId", "order")
SELECT * FROM (VALUES
  (gen_random_uuid()::text, 'dcdbccac-1e7d-4b09-8ec9-d4e084878eab', 'db795485-7e85-40cc-aa31-b20c39e9ba36', 0),
  (gen_random_uuid()::text, 'dcdbccac-1e7d-4b09-8ec9-d4e084878eab', '87b03fb2-8945-4cb0-b85f-bf10de8315fc', 1),
  (gen_random_uuid()::text, 'dcdbccac-1e7d-4b09-8ec9-d4e084878eab', '212631c5-5482-4363-ae8f-ca00e688ffd3', 2),
  (gen_random_uuid()::text, 'dcdbccac-1e7d-4b09-8ec9-d4e084878eab', 'a8b33f28-f3cf-4fd3-a8b7-bc4064aff2f1', 3),
  (gen_random_uuid()::text, 'dcdbccac-1e7d-4b09-8ec9-d4e084878eab', '9a17c1c7-32e4-41b3-a08b-55f228f1d4a0', 4),
  (gen_random_uuid()::text, 'dcdbccac-1e7d-4b09-8ec9-d4e084878eab', 'd630d994-aa5f-48ca-a07a-a75d56b7aa16', 5),
  (gen_random_uuid()::text, 'dcdbccac-1e7d-4b09-8ec9-d4e084878eab', 'd25b2881-6c34-4c4a-b6c7-ca4d5ee37365', 6),
  (gen_random_uuid()::text, 'dcdbccac-1e7d-4b09-8ec9-d4e084878eab', '79f23114-676c-410d-8a30-daab52411a37', 7),
  (gen_random_uuid()::text, 'dcdbccac-1e7d-4b09-8ec9-d4e084878eab', 'f8854153-6917-473d-9b7d-0e82229d9892', 8),
  (gen_random_uuid()::text, 'dcdbccac-1e7d-4b09-8ec9-d4e084878eab', '1c802ecf-3afc-4702-85b4-9293a51295f7', 9)
) AS v("id", "trackId", "courseId", "order")
ON CONFLICT ("trackId", "courseId") DO NOTHING;
