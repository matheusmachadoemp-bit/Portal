-- Reservas — remove por completo a gestão de Mesas e Combinações de mesas (tarefa
-- "reservas-remover-mesas"): a pedido do Matheus, o motor de disponibilidade deixou de travar
-- reserva numa mesa/combinação específica (o layout do salão muda com frequência e o cadastro de
-- mesas nunca cobria os casos reais — toda reserva manual caía em "Nenhum horário livre"). A
-- partir desta migration, disponibilidade = capacidade TOTAL do `ReservationEnvironment`, sem
-- nenhuma mesa associada à reserva. Ver bloco de comentário de redesign no `prisma/schema.prisma`
-- acima de `model ReservationEnvironment` e `src/lib/reservas-disponibilidade.ts` (motor
-- reescrito) para o racional completo.
--
-- Remove os models `ReservationTable`, `ReservationTableCombination` e
-- `ReservationTableCombinationMember` (cadastro de mesas/combinações pré-aprovadas) e a tabela de
-- junção `ReservationTableAssignment` (reserva <-> mesa) por completo — não só uma desativação,
-- o pedido foi tirar os dados e as telas mesmo. Nenhuma coluna de `Reservation` é afetada (a
-- relação com mesa sempre foi via tabela de junção separada, nunca uma FK direta nela).
--
-- Gerado manualmente (nome/ordem de constraint seguindo o mesmo padrão de
-- `prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --script`, ver
-- `20260914190000_remove_marketing_campaign_model` para um precedente do mesmo padrão de "remover
-- model por completo" neste projeto) porque o ambiente de banco descartável (`npx prisma dev`)
-- estava com a porta TCP crua sobrecarregada por múltiplos agentes rodando em paralelo no momento
-- desta tarefa (mesmo sintoma documentado no CLAUDE.md) — validação ao vivo (`migrate deploy` +
-- `migrate status` + `migrate diff --exit-code` do zero contra o histórico completo) ainda
-- pendente de confirmação por quem revisar esta tarefa (Teulis/líder) antes de publicar, ver
-- relatório da tarefa.

-- DropForeignKey
ALTER TABLE "ReservationTable" DROP CONSTRAINT "ReservationTable_environmentId_fkey";

-- DropForeignKey
ALTER TABLE "ReservationTableAssignment" DROP CONSTRAINT "ReservationTableAssignment_reservationId_fkey";

-- DropForeignKey
ALTER TABLE "ReservationTableAssignment" DROP CONSTRAINT "ReservationTableAssignment_tableId_fkey";

-- DropForeignKey
ALTER TABLE "ReservationTableCombination" DROP CONSTRAINT "ReservationTableCombination_empresaId_fkey";

-- DropForeignKey
ALTER TABLE "ReservationTableCombinationMember" DROP CONSTRAINT "ReservationTableCombinationMember_combinationId_fkey";

-- DropForeignKey
ALTER TABLE "ReservationTableCombinationMember" DROP CONSTRAINT "ReservationTableCombinationMember_tableId_fkey";

-- DropTable
DROP TABLE "ReservationTable";

-- DropTable
DROP TABLE "ReservationTableAssignment";

-- DropTable
DROP TABLE "ReservationTableCombination";

-- DropTable
DROP TABLE "ReservationTableCombinationMember";

-- DropEnum
DROP TYPE "ReservationTableStatus";

-- Subcategoria do menu lateral: "Mesas e Ambientes" -> "Ambientes" (a tela deixou de ter
-- qualquer aba de mesa/combinação; ver src/app/portal/reservas/ambientes/**, que substitui
-- src/app/portal/reservas/mesas-ambientes/**). Mantém o mesmo id/ordem/categoria — só troca
-- key/name para refletir o que sobrou na tela.
UPDATE "Subcategory"
SET "key" = 'ambientes', "name" = 'Ambientes'
WHERE "key" = 'mesas-ambientes'
  AND "categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'reservas');
