-- =============================================================================
-- Universidade Grupo Nord: Curso -> Módulo -> Aula (antes: Curso -> "Módulo",
-- que na prática já era a aula, sem nenhum agrupamento). Avaliação e
-- certificado deixam de ser por CURSO inteiro e passam a ser por MÓDULO.
-- "Trilhas de Aprendizagem" (TrainingTrack/TrainingTrackCourse) são
-- descontinuadas: todo o conteúdo real que existia nelas é absorvido pela
-- estrutura nova, nenhum dado é perdido.
--
-- Decisões de negócio confirmadas pelo Matheus antes desta migration:
--  - minScore default de avaliação sobe de 70 pra 90, continua editável por
--    módulo (mesmo padrão de antes).
--  - Certificado só é emitido em módulo COM avaliação cadastrada (regra
--    aplicada na Fase 2 / lib, não nesta migration — aqui só preparamos o
--    schema; nenhum certificado já emitido é revogado).
--  - "Atendimento Básico #1" e "#2" (2 cursos avulsos JÁ existentes em
--    produção, fora deste repositório) continuam separados por enquanto —
--    cada um vira 1 curso novo com 1 módulo só, sem fundir. Podem ser
--    fundidos depois, manualmente, pela tela.
--
-- Estrutura desta migration (padrão expand -> backfill -> contract, pra não
-- deixar a base num estado inconsistente no meio do caminho):
--   1) EXPAND   — renomeia tabelas/colunas/enum sem quebrar nada, cria as
--                 tabelas novas (TrainingModule agrupador, TrainingModuleEnrollment).
--   2) BACKFILL — converte TODO curso hoje existente em 1 módulo; cursos que
--                 hoje pertencem a uma trilha viram módulos de 1 curso novo só
--                 (a trilha "some", seu conteúdo vira o curso); cursos avulsos
--                 (sem trilha) viram 1 curso novo com 1 módulo. Matrículas,
--                 progresso de aula, avaliações e certificados são preservados
--                 e reapontados — nenhum certificado já emitido é recriado ou
--                 tem o código alterado.
--   3) CONTRACT — adiciona as chaves estrangeiras/únicas que só fazem sentido
--                 depois do backfill, e derruba TrainingTrack/TrainingTrackCourse.
--
-- Truque usado em todo o backfill pra evitar remapear ID por ID: como
-- TrainingCourse, TrainingModule (novo), TrainingEnrollment e
-- TrainingModuleEnrollment são tabelas DIFERENTES, reaproveitamos o id da
-- linha antiga como id da linha nova sempre que a relação é 1-pra-1 (curso
-- antigo -> módulo novo; matrícula antiga -> matrícula-por-módulo nova). Isso
-- significa que colunas que já apontavam pro id antigo (aula.courseId, quiz
-- do curso 10, avaliações/certificados já emitidos) continuam válidas sem
-- precisar de nenhum UPDATE linha a linha — só a tabela/coluna que elas
-- apontam muda de nome/alvo.
--
-- Testada de ponta a ponta contra um Postgres descartável local, carregado
-- com os números reais confirmados em produção via consulta somente-leitura
-- (13 TrainingCourse, 51 TrainingModule/aula, 3 TrainingTrack — 1 real com 10
-- cursos vinculados + 2 vazias sem nenhum curso —, 14 TrainingEnrollment, 2
-- TrainingModuleProgress, 0 TrainingAttempt, 2 TrainingCertificate). Depois de
-- rodar, `prisma migrate diff --from-config-datasource --to-schema` não aponta
-- nenhuma diferença estrutural além de drift pré-existente e não relacionado
-- (MarketingEntry/Sale/SalesEntry.createdById e um índice de MetaAdsInsight,
-- confirmados presentes mesmo sem nenhuma mudança desta tarefa).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) EXPAND
-- -----------------------------------------------------------------------------

-- 1.1 A antiga "TrainingModule" (aula individual, tipo vídeo/pdf/checklist/link)
-- vira "TrainingLesson" — libera o nome "TrainingModule" pro conceito novo de
-- módulo (agrupador de aulas), e evita duas tabelas quase homônimas
-- ("TrainingModule" x um "TrainingModulo") convivendo no schema.
ALTER TABLE "TrainingModule" RENAME TO "TrainingLesson";
ALTER TABLE "TrainingLesson" RENAME CONSTRAINT "TrainingModule_pkey" TO "TrainingLesson_pkey";
ALTER TABLE "TrainingLesson" RENAME COLUMN "courseId" TO "moduleId";
ALTER TABLE "TrainingLesson" DROP CONSTRAINT "TrainingModule_courseId_fkey";

-- 1.2 TrainingModuleProgress (progresso de aula assistida) vira
-- TrainingLessonProgress, reapontado pra matrícula-por-módulo (nova) em vez de
-- matrícula-por-curso.
ALTER TABLE "TrainingModuleProgress" RENAME TO "TrainingLessonProgress";
ALTER TABLE "TrainingLessonProgress" RENAME CONSTRAINT "TrainingModuleProgress_pkey" TO "TrainingLessonProgress_pkey";
ALTER TABLE "TrainingLessonProgress" RENAME COLUMN "moduleId" TO "lessonId";
ALTER TABLE "TrainingLessonProgress" RENAME COLUMN "enrollmentId" TO "moduleEnrollmentId";
ALTER TABLE "TrainingLessonProgress" DROP CONSTRAINT "TrainingModuleProgress_moduleId_fkey";
ALTER TABLE "TrainingLessonProgress" DROP CONSTRAINT "TrainingModuleProgress_enrollmentId_fkey";
DROP INDEX "TrainingModuleProgress_enrollmentId_moduleId_key";
-- FK pra TrainingLesson já pode ser recriada agora: aula não muda de id, só de
-- tabela (renomeada no passo 1.1), então o valor já é válido.
ALTER TABLE "TrainingLessonProgress" ADD CONSTRAINT "TrainingLessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "TrainingLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- FK pra TrainingModuleEnrollment (matrícula por módulo) só depois do backfill
-- (a tabela ainda não existe / ainda não tem os dados certos).

ALTER TYPE "ModuleType" RENAME TO "LessonType";

-- 1.3 TrainingQuiz passa a pertencer a um MÓDULO, não mais a um curso inteiro.
ALTER TABLE "TrainingQuiz" RENAME COLUMN "courseId" TO "moduleId";
ALTER TABLE "TrainingQuiz" DROP CONSTRAINT "TrainingQuiz_courseId_fkey";
DROP INDEX "TrainingQuiz_courseId_key";
ALTER TABLE "TrainingQuiz" ALTER COLUMN "minScore" SET DEFAULT 90;

-- 1.4 TrainingAttempt passa a apontar pra matrícula-por-módulo, não mais pra
-- matrícula-por-curso.
ALTER TABLE "TrainingAttempt" RENAME COLUMN "enrollmentId" TO "moduleEnrollmentId";
ALTER TABLE "TrainingAttempt" DROP CONSTRAINT "TrainingAttempt_enrollmentId_fkey";

-- 1.5 TrainingCertificate: idem, + ganha moduleId (curso continua existindo,
-- denormalizado, pra dar pra consultar certificados por curso sem passar por
-- módulo).
ALTER TABLE "TrainingCertificate" RENAME COLUMN "enrollmentId" TO "moduleEnrollmentId";
ALTER TABLE "TrainingCertificate" DROP CONSTRAINT "TrainingCertificate_enrollmentId_fkey";
DROP INDEX "TrainingCertificate_enrollmentId_key";
ALTER TABLE "TrainingCertificate" ADD COLUMN "moduleId" TEXT;

-- 1.6 Tabela nova: Módulo (agrupador de aulas dentro de um curso).
CREATE TABLE "TrainingModule" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "cargaHoraria" INTEGER NOT NULL DEFAULT 0,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingModule_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "TrainingModule" ADD CONSTRAINT "TrainingModule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 1.7 Tabela nova: matrícula/progresso do colaborador por MÓDULO (irmã de
-- TrainingEnrollment um degrau abaixo).
CREATE TABLE "TrainingModuleEnrollment" (
  "id" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "moduleId" TEXT NOT NULL,
  "status" "EnrollmentStatus" NOT NULL DEFAULT 'NAO_INICIADO',
  "progressPercent" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingModuleEnrollment_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "TrainingModuleEnrollment" ADD CONSTRAINT "TrainingModuleEnrollment_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "TrainingEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingModuleEnrollment" ADD CONSTRAINT "TrainingModuleEnrollment_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "TrainingModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingModuleEnrollment" ADD CONSTRAINT "TrainingModuleEnrollment_enrollmentId_moduleId_key" UNIQUE ("enrollmentId", "moduleId");

-- -----------------------------------------------------------------------------
-- 2) BACKFILL
-- -----------------------------------------------------------------------------

-- Fotografia do que existe ANTES do retrofit (todo TrainingCourse de hoje vai
-- virar módulo; toda TrainingEnrollment de hoje vai virar matrícula-por-módulo
-- + ser substituída por uma matrícula-por-curso nova, agregada).
CREATE TEMP TABLE "_retrofit_old_courses" AS SELECT "id" FROM "TrainingCourse";
CREATE TEMP TABLE "_retrofit_old_enrollments" AS
  SELECT "id", "userId", "courseId", "status", "progressPercent", "startedAt", "completedAt", "createdAt", "updatedAt"
  FROM "TrainingEnrollment";

-- Mapa: curso antigo -> id do curso novo (pai). Curso que pertence a uma
-- trilha com curso vinculado usa o PRÓPRIO ID DA TRILHA como id do curso novo
-- (assim todo mundo que já apontava pra essa trilha, se precisasse, apontaria
-- certo — e não precisamos inventar/rastrear um id novo à parte). Curso
-- avulso (sem trilha) ganha um id novo aleatório, 1 pra cada.
CREATE TEMP TABLE "_retrofit_course_map" AS
SELECT DISTINCT ON (oc."id")
  oc."id" AS old_course_id,
  COALESCE(tc."trackId", gen_random_uuid()::text) AS new_course_id,
  (tc."trackId" IS NOT NULL) AS from_track
FROM "TrainingCourse" oc
LEFT JOIN "TrainingTrackCourse" tc ON tc."courseId" = oc."id"
ORDER BY oc."id", tc."trackId" ASC NULLS LAST;

-- Dados agregados de cada curso novo: 1 linha por curso novo, juntando os
-- dados da trilha (quando existir) com os dos cursos-que-viram-módulo.
CREATE TEMP TABLE "_retrofit_new_course_data" AS
SELECT
  m.new_course_id,
  bool_and(m.from_track) AS from_track,
  -- Nome do curso novo: quando vem de trilha, usa o nome da trilha sem o
  -- prefixo "Trilha..." (ex.: "Trilha de Onboarding" -> "Onboarding"), já que
  -- o resultado não é mais chamado de trilha.
  COALESCE(regexp_replace(MAX(t."name"), '^[Tt]rilha (de |da |do )?', ''), (array_agg(oc."name" ORDER BY oc."order"))[1]) AS "name",
  COALESCE(MAX(t."description"), (array_agg(oc."description" ORDER BY oc."order"))[1]) AS "description",
  COALESCE(MAX(t."cargo"), (array_agg(oc."cargo" ORDER BY oc."order"))[1]) AS "cargo",
  COALESCE(MAX(t."empresaId"), (array_agg(oc."empresaId" ORDER BY oc."order"))[1]) AS "empresaId",
  (array_agg(oc."category" ORDER BY oc."order"))[1] AS "category",
  (array_agg(oc."imageUrl" ORDER BY oc."order"))[1] AS "imageUrl",
  (array_agg(oc."instructor" ORDER BY oc."order"))[1] AS "instructor",
  SUM(oc."cargaHoraria")::int AS "cargaHoraria",
  (array_agg(oc."status" ORDER BY oc."order"))[1] AS "status",
  bool_or(oc."mandatory") AS "mandatory",
  MIN(oc."order") AS "order",
  (array_agg(oc."createdById" ORDER BY oc."createdAt" ASC))[1] AS "createdById",
  MIN(oc."createdAt") AS "createdAt"
FROM "_retrofit_course_map" m
JOIN "TrainingCourse" oc ON oc."id" = m.old_course_id
LEFT JOIN "TrainingTrack" t ON t."id" = m.new_course_id AND m.from_track
GROUP BY m.new_course_id;

-- Cria os cursos novos (pais). Slug novo gerado a partir do nome + um sufixo
-- estável (hash do id), já que o slug antigo pode ter sido reaproveitado por
-- um curso que vira módulo (e o antigo só é apagado mais adiante).
INSERT INTO "TrainingCourse"
  ("id", "name", "slug", "category", "description", "cargo", "empresaId", "imageUrl", "instructor", "cargaHoraria", "status", "mandatory", "version", "order", "createdById", "createdAt", "updatedAt")
SELECT
  new_course_id,
  "name",
  lower(regexp_replace("name", '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(md5(new_course_id), 1, 8),
  "category",
  "description",
  "cargo",
  "empresaId",
  "imageUrl",
  "instructor",
  "cargaHoraria",
  "status",
  "mandatory",
  1,
  "order",
  "createdById",
  "createdAt",
  now()
FROM "_retrofit_new_course_data";

-- Cria os módulos (1 por curso antigo, reaproveitando o id do curso antigo
-- como id do módulo novo — é por isso que aula/avaliação/certificado que já
-- apontavam pro curso antigo continuam válidos sem remapear nada).
INSERT INTO "TrainingModule" ("id", "courseId", "title", "description", "cargaHoraria", "order", "createdAt", "updatedAt")
SELECT
  oc."id",
  m.new_course_id,
  oc."name",
  oc."description",
  oc."cargaHoraria",
  COALESCE(tc."order", oc."order"),
  oc."createdAt",
  now()
FROM "TrainingCourse" oc
JOIN "_retrofit_course_map" m ON m.old_course_id = oc."id"
LEFT JOIN "TrainingTrackCourse" tc ON tc."courseId" = oc."id" AND tc."trackId" = m.new_course_id;

-- Mapa: (colaborador, curso novo) -> id da matrícula-por-curso nova (agregada).
CREATE TEMP TABLE "_retrofit_new_enrollment_map" AS
SELECT
  gen_random_uuid()::text AS new_enrollment_id,
  oe."userId",
  m.new_course_id
FROM "_retrofit_old_enrollments" oe
JOIN "_retrofit_course_map" m ON m.old_course_id = oe."courseId"
GROUP BY oe."userId", m.new_course_id;

-- Cria as matrículas-por-curso novas, com status/progresso agregados a partir
-- de todas as matrículas antigas (por módulo) daquele colaborador naquele
-- curso novo.
INSERT INTO "TrainingEnrollment" ("id", "userId", "courseId", "status", "progressPercent", "startedAt", "completedAt", "createdAt", "updatedAt")
SELECT
  nem.new_enrollment_id,
  nem."userId",
  nem.new_course_id,
  CASE
    WHEN bool_and(oe."status" = 'CONCLUIDO') THEN 'CONCLUIDO'::"EnrollmentStatus"
    WHEN bool_or(oe."status" <> 'NAO_INICIADO') THEN 'EM_ANDAMENTO'::"EnrollmentStatus"
    ELSE 'NAO_INICIADO'::"EnrollmentStatus"
  END,
  ROUND(AVG(oe."progressPercent"))::int,
  MIN(oe."startedAt"),
  CASE WHEN bool_and(oe."status" = 'CONCLUIDO') THEN MAX(oe."completedAt") ELSE NULL END,
  MIN(oe."createdAt"),
  now()
FROM "_retrofit_new_enrollment_map" nem
JOIN "_retrofit_old_enrollments" oe ON oe."userId" = nem."userId"
JOIN "_retrofit_course_map" m ON m.old_course_id = oe."courseId" AND m.new_course_id = nem.new_course_id
GROUP BY nem.new_enrollment_id, nem."userId", nem.new_course_id;

-- Cria as matrículas-por-módulo (reaproveitando o id da matrícula antiga —
-- por isso avaliações/certificados que já apontavam pra ela continuam
-- válidos sem remapear nada).
INSERT INTO "TrainingModuleEnrollment" ("id", "enrollmentId", "moduleId", "status", "progressPercent", "startedAt", "completedAt", "createdAt", "updatedAt")
SELECT
  oe."id",
  nem.new_enrollment_id,
  oe."courseId",
  oe."status",
  oe."progressPercent",
  oe."startedAt",
  oe."completedAt",
  oe."createdAt",
  now()
FROM "_retrofit_old_enrollments" oe
JOIN "_retrofit_course_map" m ON m.old_course_id = oe."courseId"
JOIN "_retrofit_new_enrollment_map" nem ON nem."userId" = oe."userId" AND nem.new_course_id = m.new_course_id;

-- Apaga as matrículas-por-curso antigas — o dado de cada uma já foi
-- preservado na matrícula-por-módulo (acima, mesmo id) e agregado na
-- matrícula-por-curso nova.
DELETE FROM "TrainingEnrollment" WHERE "id" IN (SELECT "id" FROM "_retrofit_old_enrollments");

-- Certificado: moduleId = antigo courseId (o módulo reaproveitou esse id);
-- courseId passa a ser o curso novo (pai). moduleEnrollmentId já está certo
-- (renomeado em 1.5, valor não muda). Nenhum certificado é recriado — code,
-- issuedAt, cargaHoraria e userId continuam 100% intactos.
UPDATE "TrainingCertificate" c
SET "moduleId" = c."courseId",
    "courseId" = m.new_course_id
FROM "_retrofit_course_map" m
WHERE m.old_course_id = c."courseId";

-- As trilhas (e o vínculo trilha-curso) tiveram todo o conteúdo real absorvido
-- acima — inclusive as 2 trilhas vazias (sem curso vinculado), que não tinham
-- nada pra absorver. Não sobra mais nenhum uso pra esses 2 models.
DROP TABLE "TrainingTrackCourse";
DROP TABLE "TrainingTrack";

-- Cursos antigos: cada um já virou módulo (acima); some como curso.
DELETE FROM "TrainingCourse" WHERE "id" IN (SELECT "id" FROM "_retrofit_old_courses");

-- -----------------------------------------------------------------------------
-- 3) CONTRACT
-- -----------------------------------------------------------------------------

ALTER TABLE "TrainingLesson" ADD CONSTRAINT "TrainingLesson_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "TrainingModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrainingLessonProgress" ADD CONSTRAINT "TrainingLessonProgress_moduleEnrollmentId_fkey" FOREIGN KEY ("moduleEnrollmentId") REFERENCES "TrainingModuleEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingLessonProgress" ADD CONSTRAINT "TrainingLessonProgress_moduleEnrollmentId_lessonId_key" UNIQUE ("moduleEnrollmentId", "lessonId");

ALTER TABLE "TrainingQuiz" ADD CONSTRAINT "TrainingQuiz_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "TrainingModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingQuiz" ADD CONSTRAINT "TrainingQuiz_moduleId_key" UNIQUE ("moduleId");

ALTER TABLE "TrainingAttempt" ADD CONSTRAINT "TrainingAttempt_moduleEnrollmentId_fkey" FOREIGN KEY ("moduleEnrollmentId") REFERENCES "TrainingModuleEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrainingCertificate" ALTER COLUMN "moduleId" SET NOT NULL;
ALTER TABLE "TrainingCertificate" ADD CONSTRAINT "TrainingCertificate_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "TrainingModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TrainingCertificate" ADD CONSTRAINT "TrainingCertificate_moduleEnrollmentId_fkey" FOREIGN KEY ("moduleEnrollmentId") REFERENCES "TrainingModuleEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TrainingCertificate" ADD CONSTRAINT "TrainingCertificate_moduleEnrollmentId_key" UNIQUE ("moduleEnrollmentId");

DROP TABLE "_retrofit_old_courses";
DROP TABLE "_retrofit_old_enrollments";
DROP TABLE "_retrofit_course_map";
DROP TABLE "_retrofit_new_course_data";
DROP TABLE "_retrofit_new_enrollment_map";
