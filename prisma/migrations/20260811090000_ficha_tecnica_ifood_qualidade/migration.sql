-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN "taxaIfoodPadrao" DOUBLE PRECISION NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "taxaIfood" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ProductIngredient" ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CategoryQualityConfig" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "cmvMaximoPercent" DOUBLE PRECISION NOT NULL DEFAULT 35,
    "diasDesatualizada" INTEGER NOT NULL DEFAULT 90,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryQualityConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoryQualityConfig_empresaId_category_key" ON "CategoryQualityConfig"("empresaId", "category");

-- AddForeignKey
ALTER TABLE "CategoryQualityConfig" ADD CONSTRAINT "CategoryQualityConfig_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
