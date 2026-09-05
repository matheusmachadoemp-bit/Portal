-- AlterTable
ALTER TABLE "SatisfactionQuestion" ADD COLUMN     "ativo" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "SatisfactionInvitation" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "respondido" BOOLEAN NOT NULL DEFAULT false,
    "respondidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SatisfactionInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SatisfactionResponse" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "setor" TEXT,
    "comentarioAdicional" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SatisfactionResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SatisfactionAnswer" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "valorNumero" INTEGER,
    "valorTexto" TEXT,
    "valorBooleano" BOOLEAN,
    "optionId" TEXT,

    CONSTRAINT "SatisfactionAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SatisfactionAnswerOption" (
    "id" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,

    CONSTRAINT "SatisfactionAnswerOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SatisfactionInvitation_token_key" ON "SatisfactionInvitation"("token");

-- CreateIndex
CREATE INDEX "SatisfactionInvitation_surveyId_idx" ON "SatisfactionInvitation"("surveyId");

-- CreateIndex
CREATE UNIQUE INDEX "SatisfactionInvitation_surveyId_employeeId_key" ON "SatisfactionInvitation"("surveyId", "employeeId");

-- CreateIndex
CREATE INDEX "SatisfactionResponse_surveyId_idx" ON "SatisfactionResponse"("surveyId");

-- CreateIndex
CREATE INDEX "SatisfactionResponse_empresaId_setor_idx" ON "SatisfactionResponse"("empresaId", "setor");

-- CreateIndex
CREATE INDEX "SatisfactionAnswer_questionId_idx" ON "SatisfactionAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "SatisfactionAnswer_responseId_questionId_key" ON "SatisfactionAnswer"("responseId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "SatisfactionAnswerOption_answerId_optionId_key" ON "SatisfactionAnswerOption"("answerId", "optionId");

-- AddForeignKey
ALTER TABLE "SatisfactionInvitation" ADD CONSTRAINT "SatisfactionInvitation_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "SatisfactionSurvey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatisfactionInvitation" ADD CONSTRAINT "SatisfactionInvitation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatisfactionResponse" ADD CONSTRAINT "SatisfactionResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "SatisfactionSurvey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatisfactionResponse" ADD CONSTRAINT "SatisfactionResponse_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatisfactionAnswer" ADD CONSTRAINT "SatisfactionAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "SatisfactionResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatisfactionAnswer" ADD CONSTRAINT "SatisfactionAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "SatisfactionQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatisfactionAnswer" ADD CONSTRAINT "SatisfactionAnswer_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "SatisfactionQuestionOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatisfactionAnswerOption" ADD CONSTRAINT "SatisfactionAnswerOption_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "SatisfactionAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatisfactionAnswerOption" ADD CONSTRAINT "SatisfactionAnswerOption_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "SatisfactionQuestionOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

