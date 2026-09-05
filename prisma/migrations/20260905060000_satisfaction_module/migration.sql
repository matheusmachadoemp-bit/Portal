-- CreateEnum
CREATE TYPE "SatisfactionSurveyStatus" AS ENUM ('RASCUNHO', 'PROGRAMADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "SatisfactionQuestionType" AS ENUM ('ENPS', 'AVALIACAO', 'ESCOLHA_UNICA', 'MULTIPLA_ESCOLHA', 'SIM_NAO', 'ABERTA');

-- CreateEnum
CREATE TYPE "SatisfactionTheme" AS ENUM ('LIDERANCA', 'AMBIENTE', 'COMUNICACAO', 'RECONHECIMENTO', 'TREINAMENTO', 'BEM_ESTAR', 'ESCALA_FOLGAS');

-- CreateTable
CREATE TABLE "SatisfactionSurvey" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "SatisfactionSurveyStatus" NOT NULL DEFAULT 'RASCUNHO',
    "anonima" BOOLEAN NOT NULL DEFAULT true,
    "permitirApenasUmaResposta" BOOLEAN NOT NULL DEFAULT true,
    "exibirResultadoColaborador" BOOLEAN NOT NULL DEFAULT false,
    "permitirComentarioAdicional" BOOLEAN NOT NULL DEFAULT true,
    "embaralharPerguntas" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SatisfactionSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SatisfactionAudience" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "setor" TEXT,

    CONSTRAINT "SatisfactionAudience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SatisfactionQuestion" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "tipo" "SatisfactionQuestionType" NOT NULL DEFAULT 'AVALIACAO',
    "tema" "SatisfactionTheme",
    "titulo" TEXT NOT NULL,
    "orientacao" TEXT,
    "obrigatoria" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SatisfactionQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SatisfactionQuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SatisfactionQuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SatisfactionSurvey_status_idx" ON "SatisfactionSurvey"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SatisfactionAudience_surveyId_empresaId_setor_key" ON "SatisfactionAudience"("surveyId", "empresaId", "setor");

-- CreateIndex
CREATE INDEX "SatisfactionQuestion_surveyId_idx" ON "SatisfactionQuestion"("surveyId");

-- AddForeignKey
ALTER TABLE "SatisfactionSurvey" ADD CONSTRAINT "SatisfactionSurvey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatisfactionAudience" ADD CONSTRAINT "SatisfactionAudience_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "SatisfactionSurvey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatisfactionAudience" ADD CONSTRAINT "SatisfactionAudience_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatisfactionQuestion" ADD CONSTRAINT "SatisfactionQuestion_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "SatisfactionSurvey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatisfactionQuestionOption" ADD CONSTRAINT "SatisfactionQuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "SatisfactionQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Subcategoria "Pesquisa de Satisfação" no menu lateral, dentro de RH
INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "color", "order", "active", "isSystem", "createdAt", "updatedAt")
SELECT 'sub-rh-pesquisa-satisfacao', "id", 'pesquisa-satisfacao', 'Pesquisa de Satisfação', 'Smile', '#2952E3', 7, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Category" WHERE "key" = 'rh'
ON CONFLICT ("categoryId", "key") DO NOTHING;

UPDATE "Subcategory" SET "order" = 8
WHERE "key" = 'dashboard' AND "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'rh');
