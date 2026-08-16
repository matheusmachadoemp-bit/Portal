-- CreateEnum
CREATE TYPE "SalesEntrySource" AS ENUM ('MANUAL', 'SAIPOS');

-- AlterTable
ALTER TABLE "SalesEntry" ADD COLUMN "source" "SalesEntrySource" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "SalesEntry" ALTER COLUMN "createdById" DROP NOT NULL;
