-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN "cardapioWebEstablishmentId" TEXT;
ALTER TABLE "Empresa" ADD COLUMN "cardapioWebSecret" TEXT;
ALTER TABLE "Empresa" ADD COLUMN "cardapioWebSyncEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Empresa" ADD COLUMN "cardapioWebLastSyncAt" TIMESTAMP(3);
ALTER TABLE "Empresa" ADD COLUMN "cardapioWebLastTestAt" TIMESTAMP(3);
ALTER TABLE "Empresa" ADD COLUMN "cardapioWebLastTestResult" TEXT;
