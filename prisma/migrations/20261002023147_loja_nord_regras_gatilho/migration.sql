-- CreateEnum
CREATE TYPE "LojaNordRuleGatilho" AS ENUM ('EVENTO_PONTUAL', 'AGREGADO_MENSAL');

-- AlterTable
ALTER TABLE "LojaNordPointRule" ADD COLUMN     "gatilho" "LojaNordRuleGatilho" NOT NULL DEFAULT 'EVENTO_PONTUAL';
