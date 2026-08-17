-- CreateEnum
CREATE TYPE "SalePlatform" AS ENUM ('SITE_PROPRIO', 'IFOOD', 'FOOD99');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "platform" "SalePlatform" NOT NULL DEFAULT 'SITE_PROPRIO';
ALTER TABLE "Sale" ADD COLUMN "cancelado" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SaiposSale" ADD COLUMN "platform" "SalePlatform" NOT NULL DEFAULT 'SITE_PROPRIO';
ALTER TABLE "SaiposSale" ADD COLUMN "cancelado" BOOLEAN NOT NULL DEFAULT false;
