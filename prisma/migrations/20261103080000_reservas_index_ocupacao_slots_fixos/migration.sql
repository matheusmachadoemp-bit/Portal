-- Substitui o índice `[environmentId, startTime, endTime]` de `Reservation`, obsoleto desde o
-- redesign "reservas-slots-fixos": o motor de disponibilidade (`getOccupyingReservations` em
-- `src/lib/reservas-disponibilidade.ts` e a revalidação dentro do lock em
-- `reserveEnvironmentTransacted`) deixou de comparar sobreposição de intervalo
-- (`startTime`/`endTime`) e passou a filtrar por `environmentId + status + date`, comparando
-- `startTime` por igualdade EM MEMÓRIA depois de já ter os candidatos do dia. Achado do Mylon na
-- revisão geral de Reservas (tarefa #190).

-- DropIndex
DROP INDEX "Reservation_environmentId_startTime_endTime_idx";

-- CreateIndex
CREATE INDEX "Reservation_environmentId_status_date_idx" ON "Reservation"("environmentId", "status", "date");
