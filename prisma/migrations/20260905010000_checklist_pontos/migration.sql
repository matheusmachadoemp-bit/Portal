-- CreateTable
CREATE TABLE "ChecklistPontos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "pontos" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistPontos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistPontos_occurrenceId_key" ON "ChecklistPontos"("occurrenceId");

-- CreateIndex
CREATE INDEX "ChecklistPontos_userId_idx" ON "ChecklistPontos"("userId");

-- AddForeignKey
ALTER TABLE "ChecklistPontos" ADD CONSTRAINT "ChecklistPontos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistPontos" ADD CONSTRAINT "ChecklistPontos_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "ChecklistOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
