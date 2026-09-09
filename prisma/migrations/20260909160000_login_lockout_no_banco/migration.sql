-- Move o bloqueio de tentativas de login (força bruta) da memória do
-- processo Node para o banco, já que em produção (Vercel, serverless) cada
-- instância tem sua própria memória e o contador antigo não era realmente
-- compartilhado entre elas.
ALTER TABLE "User" ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lockedUntil" TIMESTAMP(3);
