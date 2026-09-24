-- CreateEnum
CREATE TYPE "CustomerSurveyQuestionType" AS ENUM ('NOTA_0_5', 'NOTA_0_10', 'GOSTEI_NAO_GOSTEI', 'TEXTO_LIVRE');

-- CreateEnum
CREATE TYPE "CustomerSurveyStatus" AS ENUM ('NOVA', 'EM_ATENDIMENTO', 'RESOLVIDA');

-- CreateEnum
CREATE TYPE "RouletteSpinStatus" AS ENUM ('DISPONIVEL', 'RESGATADO', 'EXPIRADO');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "atendeSalao" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CustomerSurveyTable" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "qrGeradoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerSurveyTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSurveyQuestion" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT,
    "tipo" "CustomerSurveyQuestionType" NOT NULL,
    "titulo" TEXT NOT NULL,
    "tema" TEXT,
    "obrigatoria" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "fixaNotaGeral" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerSurveyQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSurveyReasonTag" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CustomerSurveyReasonTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSurveyResponse" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tableId" TEXT,
    "clienteId" TEXT,
    "nomeInformado" TEXT NOT NULL,
    "telefoneInformado" TEXT NOT NULL,
    "dataNascimentoInformada" TIMESTAMP(3),
    "garcomIndicadoId" TEXT,
    "notaGeral" INTEGER NOT NULL,
    "critica" BOOLEAN NOT NULL DEFAULT false,
    "motivoTagId" TEXT,
    "sugestao" TEXT,
    "status" "CustomerSurveyStatus" NOT NULL DEFAULT 'NOVA',
    "responsavelId" TEXT,
    "assumidoEm" TIMESTAMP(3),
    "resolucaoTexto" TEXT,
    "resolvidoEm" TIMESTAMP(3),
    "ip" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerSurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSurveyAnswer" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "valorNota" INTEGER,
    "valorGostei" BOOLEAN,
    "valorTexto" TEXT,

    CONSTRAINT "CustomerSurveyAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSurveyConfig" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "notaCriticaAbaixoDe" INTEGER NOT NULL DEFAULT 6,
    "notaPositivaAPartirDe" INTEGER NOT NULL DEFAULT 8,
    "giroRoletaIntervaloDias" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerSurveyConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSurveyAlertRecipient" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CustomerSurveyAlertRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoulettePrize" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "imagemUrl" TEXT,
    "icone" TEXT,
    "quantidadeDisponivel" INTEGER,
    "quantidadeGanha" INTEGER NOT NULL DEFAULT 0,
    "probabilidadePercent" DOUBLE PRECISION NOT NULL,
    "validadeDias" INTEGER NOT NULL DEFAULT 30,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoulettePrize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouletteSpin" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "clienteId" TEXT,
    "telefone" TEXT NOT NULL,
    "prizeId" TEXT NOT NULL,
    "codigo" TEXT,
    "status" "RouletteSpinStatus" NOT NULL DEFAULT 'DISPONIVEL',
    "validadeAte" TIMESTAMP(3),
    "resgatadoEm" TIMESTAMP(3),
    "resgatadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouletteSpin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouletteEligibility" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "ultimoGiroEm" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RouletteEligibility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSurveyTable_token_key" ON "CustomerSurveyTable"("token");

-- CreateIndex
CREATE INDEX "CustomerSurveyTable_empresaId_idx" ON "CustomerSurveyTable"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSurveyTable_empresaId_numero_key" ON "CustomerSurveyTable"("empresaId", "numero");

-- CreateIndex
CREATE INDEX "CustomerSurveyQuestion_empresaId_idx" ON "CustomerSurveyQuestion"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSurveyReasonTag_empresaId_nome_key" ON "CustomerSurveyReasonTag"("empresaId", "nome");

-- CreateIndex
CREATE INDEX "CustomerSurveyResponse_empresaId_submittedAt_idx" ON "CustomerSurveyResponse"("empresaId", "submittedAt");

-- CreateIndex
CREATE INDEX "CustomerSurveyResponse_empresaId_critica_status_idx" ON "CustomerSurveyResponse"("empresaId", "critica", "status");

-- CreateIndex
CREATE INDEX "CustomerSurveyResponse_garcomIndicadoId_idx" ON "CustomerSurveyResponse"("garcomIndicadoId");

-- CreateIndex
CREATE INDEX "CustomerSurveyResponse_tableId_idx" ON "CustomerSurveyResponse"("tableId");

-- CreateIndex
CREATE INDEX "CustomerSurveyResponse_clienteId_idx" ON "CustomerSurveyResponse"("clienteId");

-- CreateIndex
CREATE INDEX "CustomerSurveyAnswer_questionId_idx" ON "CustomerSurveyAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSurveyAnswer_responseId_questionId_key" ON "CustomerSurveyAnswer"("responseId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSurveyConfig_empresaId_key" ON "CustomerSurveyConfig"("empresaId");

-- CreateIndex
CREATE INDEX "CustomerSurveyAlertRecipient_empresaId_idx" ON "CustomerSurveyAlertRecipient"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSurveyAlertRecipient_empresaId_userId_key" ON "CustomerSurveyAlertRecipient"("empresaId", "userId");

-- CreateIndex
CREATE INDEX "RoulettePrize_empresaId_ativo_idx" ON "RoulettePrize"("empresaId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "RouletteSpin_responseId_key" ON "RouletteSpin"("responseId");

-- CreateIndex
CREATE UNIQUE INDEX "RouletteSpin_codigo_key" ON "RouletteSpin"("codigo");

-- CreateIndex
CREATE INDEX "RouletteSpin_empresaId_telefone_createdAt_idx" ON "RouletteSpin"("empresaId", "telefone", "createdAt");

-- CreateIndex
CREATE INDEX "RouletteSpin_prizeId_idx" ON "RouletteSpin"("prizeId");

-- CreateIndex
CREATE UNIQUE INDEX "RouletteEligibility_empresaId_telefone_key" ON "RouletteEligibility"("empresaId", "telefone");

-- AddForeignKey
ALTER TABLE "CustomerSurveyTable" ADD CONSTRAINT "CustomerSurveyTable_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSurveyQuestion" ADD CONSTRAINT "CustomerSurveyQuestion_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSurveyReasonTag" ADD CONSTRAINT "CustomerSurveyReasonTag_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSurveyResponse" ADD CONSTRAINT "CustomerSurveyResponse_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSurveyResponse" ADD CONSTRAINT "CustomerSurveyResponse_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "CustomerSurveyTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSurveyResponse" ADD CONSTRAINT "CustomerSurveyResponse_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSurveyResponse" ADD CONSTRAINT "CustomerSurveyResponse_garcomIndicadoId_fkey" FOREIGN KEY ("garcomIndicadoId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSurveyResponse" ADD CONSTRAINT "CustomerSurveyResponse_motivoTagId_fkey" FOREIGN KEY ("motivoTagId") REFERENCES "CustomerSurveyReasonTag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSurveyResponse" ADD CONSTRAINT "CustomerSurveyResponse_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSurveyAnswer" ADD CONSTRAINT "CustomerSurveyAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "CustomerSurveyResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSurveyAnswer" ADD CONSTRAINT "CustomerSurveyAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "CustomerSurveyQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSurveyConfig" ADD CONSTRAINT "CustomerSurveyConfig_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSurveyAlertRecipient" ADD CONSTRAINT "CustomerSurveyAlertRecipient_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSurveyAlertRecipient" ADD CONSTRAINT "CustomerSurveyAlertRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoulettePrize" ADD CONSTRAINT "RoulettePrize_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouletteSpin" ADD CONSTRAINT "RouletteSpin_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouletteSpin" ADD CONSTRAINT "RouletteSpin_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "CustomerSurveyResponse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouletteSpin" ADD CONSTRAINT "RouletteSpin_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouletteSpin" ADD CONSTRAINT "RouletteSpin_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "RoulettePrize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouletteSpin" ADD CONSTRAINT "RouletteSpin_resgatadoPorId_fkey" FOREIGN KEY ("resgatadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouletteEligibility" ADD CONSTRAINT "RouletteEligibility_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
