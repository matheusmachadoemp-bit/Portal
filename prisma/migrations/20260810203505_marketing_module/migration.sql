-- CreateEnum
CREATE TYPE "MarketingStatus" AS ENUM ('IDEIA', 'A_PRODUZIR', 'EM_PRODUCAO', 'EM_EDICAO', 'EM_ANALISE', 'AGENDADO', 'PUBLICADO', 'RESULTADOS');

-- CreateEnum
CREATE TYPE "MarketingPriority" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE');

-- CreateEnum
CREATE TYPE "MarketingCampaignStatus" AS ENUM ('PLANEJADA', 'EM_ANDAMENTO', 'PAUSADA', 'CONCLUIDA');

-- CreateEnum
CREATE TYPE "MarketingIdeaStatus" AS ENUM ('NOVA', 'EM_AVALIACAO', 'APROVADA', 'DESCARTADA');

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "driveFolderUrl" TEXT;

-- CreateTable
CREATE TABLE "MarketingTask" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "objetivo" TEXT,
    "category" TEXT,
    "socialNetwork" TEXT,
    "format" TEXT,
    "status" "MarketingStatus" NOT NULL DEFAULT 'A_PRODUZIR',
    "priority" "MarketingPriority" NOT NULL DEFAULT 'MEDIA',
    "date" TIMESTAMP(3),
    "time" TEXT,
    "responsavelId" TEXT,
    "checklist" TEXT,
    "tags" TEXT,
    "estimatedMinutes" INTEGER,
    "actualMinutes" INTEGER,
    "recurrenceRule" TEXT,
    "campaignId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingComment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingCampaign" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "budget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "investimento" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retorno" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "responsavelId" TEXT,
    "status" "MarketingCampaignStatus" NOT NULL DEFAULT 'PLANEJADA',
    "resultados" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingFile" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Artes',
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "tags" TEXT,
    "taskId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingIdea" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "references" TEXT,
    "links" TEXT,
    "category" TEXT,
    "tags" TEXT,
    "status" "MarketingIdeaStatus" NOT NULL DEFAULT 'NOVA',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingIdea_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MarketingTask" ADD CONSTRAINT "MarketingTask_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingTask" ADD CONSTRAINT "MarketingTask_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingTask" ADD CONSTRAINT "MarketingTask_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingTask" ADD CONSTRAINT "MarketingTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingComment" ADD CONSTRAINT "MarketingComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "MarketingTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingComment" ADD CONSTRAINT "MarketingComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingFile" ADD CONSTRAINT "MarketingFile_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingFile" ADD CONSTRAINT "MarketingFile_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "MarketingTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingFile" ADD CONSTRAINT "MarketingFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingIdea" ADD CONSTRAINT "MarketingIdea_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingIdea" ADD CONSTRAINT "MarketingIdea_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

