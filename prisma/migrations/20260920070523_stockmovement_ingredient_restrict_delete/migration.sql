-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_ingredientId_fkey";

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
