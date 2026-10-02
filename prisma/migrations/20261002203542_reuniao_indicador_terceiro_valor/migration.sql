-- AlterTable
ALTER TABLE "ReuniaoCustomIndicator" ADD COLUMN     "nomeTerciario" TEXT,
ADD COLUMN     "unidadeTerciaria" "ReuniaoIndicatorUnit";

-- AlterTable
ALTER TABLE "ReuniaoCustomIndicatorValue" ADD COLUMN     "valorTerciario" DOUBLE PRECISION;
