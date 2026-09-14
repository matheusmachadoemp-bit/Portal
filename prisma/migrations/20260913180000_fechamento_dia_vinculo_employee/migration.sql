-- Vínculo entre conta de login (User) e ficha de funcionário do RH (Employee) — decisão do
-- usuário depois de confirmar (rodando contra os dados reais do seed) que não existia nenhum
-- vínculo de verdade nem forma confiável de inferir um (nome/e-mail não batem hoje: nenhum
-- Employee do seed tem e-mail preenchido, e nenhum tem cargo "Gerente"/"Chef de Salão"/"Chef de
-- Cozinha"). Sem popular nada retroativamente por adivinhação, como pedido — a coluna nasce só
-- com NULL para todo mundo; quem definir o vínculo é a rota de Usuários (POST/PATCH
-- /api/usuarios), pela tela de Usuários, um a um.
--
-- @unique em "User"."employeeId" garante 1:1 no banco (um Employee nunca fica vinculado a mais
-- de um User ao mesmo tempo) — mesma convenção de nome de índice/constraint já usada em outras
-- relações 1:1 do schema (ex.: "LoyaltyAccount_clienteId_key").
-- AlterTable
ALTER TABLE "User" ADD COLUMN "employeeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
