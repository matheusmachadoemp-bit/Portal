-- CreateEnum
CREATE TYPE "GoalDirection" AS ENUM ('MAXIMIZAR', 'MINIMIZAR');

-- AlterTable
ALTER TABLE "Goal" ADD COLUMN     "direcao" "GoalDirection" NOT NULL DEFAULT 'MAXIMIZAR';
