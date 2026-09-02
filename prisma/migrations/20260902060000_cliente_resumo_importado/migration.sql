-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN "pedidosImportados" INTEGER;
ALTER TABLE "Cliente" ADD COLUMN "valorGastoImportado" DOUBLE PRECISION;
ALTER TABLE "Cliente" ADD COLUMN "ticketMedioImportado" DOUBLE PRECISION;
ALTER TABLE "Cliente" ADD COLUMN "ultimaCompraImportada" TIMESTAMP(3);
