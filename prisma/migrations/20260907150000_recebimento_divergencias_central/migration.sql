-- CreateEnum
CREATE TYPE "ReceivingItemResolutionType" AS ENUM ('AGUARDANDO', 'FORNECEDOR_REPOSICAO', 'FORNECEDOR_CREDITO', 'PRODUTO_DEVOLVIDO', 'DIFERENCA_ACEITA', 'OUTRA');

-- AlterTable
ALTER TABLE "ReceivingItem" ADD COLUMN     "resolucaoDataPrevista" TIMESTAMP(3),
ADD COLUMN     "resolucaoObservacao" TEXT,
ADD COLUMN     "resolucaoTipo" "ReceivingItemResolutionType" NOT NULL DEFAULT 'AGUARDANDO',
ADD COLUMN     "resolucaoValorCredito" DOUBLE PRECISION,
ADD COLUMN     "resolvidoEm" TIMESTAMP(3),
ADD COLUMN     "resolvidoPorId" TEXT;

-- AddForeignKey
ALTER TABLE "ReceivingItem" ADD CONSTRAINT "ReceivingItem_resolvidoPorId_fkey" FOREIGN KEY ("resolvidoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Nova subcategoria de menu: Central de Divergências de Recebimento (dentro de Estoque).
INSERT INTO "Subcategory" ("id", "categoryId", "key", "name", "icon", "color", "order", "active", "isSystem", "createdAt", "updatedAt")
SELECT 'sub-estoque-divergencias-recebimento', "id", 'divergencias-recebimento', 'Divergências de Recebimento', 'TriangleAlert', '#2952E3', 16, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Category" WHERE "key" = 'estoque'
ON CONFLICT ("categoryId", "key") DO NOTHING;
