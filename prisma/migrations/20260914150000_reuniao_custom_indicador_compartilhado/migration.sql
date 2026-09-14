-- Generaliza o mecanismo de "Fechamento do mês" (nome do indicador + 1 valor
-- por período, sem meta-alvo nem premiação), hoje específico do Gerente
-- (GerenteCustomIndicator/GerenteCustomIndicatorValue), para poder ser
-- reaproveitado por Salão/Cozinha/Delivery (próxima migration,
-- 20260914160000_salao_cozinha_delivery_fechamento_do_mes) e por Liderança
-- (20260914170000_lideranca_meeting) sem duplicar a mesma estrutura de
-- tabelas 4-5 vezes.
--
-- Decisão de arquitetura (ver relatório da tarefa): em vez de criar
-- SalaoCustomIndicator/Value, CozinhaCustomIndicator/Value,
-- DeliveryCustomIndicator/Value e LiderancaCustomIndicator/Value como cópias
-- praticamente idênticas do par já existente, generalizamos num par único —
-- ReuniaoCustomIndicator/ReuniaoCustomIndicatorValue — com um campo
-- `meetingKey` (enum fechado ReuniaoMeetingKey: GERENTE/SALAO/COZINHA/
-- DELIVERY/LIDERANCA, o mesmo conjunto das 5 subcategorias do menu lateral
-- "reuniao" em prisma/seed.ts) dizendo a qual das 5 reuniões cada indicador
-- pertence. Isso significa migrar o Gerente pro esquema novo agora — feito
-- por RENAME (tabela + enum de unidade), preservando 100% do histórico já
-- lançado (os 4 indicadores fixos migrados em
-- 20260914140000_gerente_fechamento_do_mes + qualquer outro criado
-- livremente, ex.: "Ticket Médio Salão"/"Ticket Médio Delivery", e todos os
-- valores por período já salvos em GerenteCustomIndicatorValue).
--
-- Passo a passo:
-- 1) Cria o enum ReuniaoMeetingKey.
-- 2) Renomeia o enum GerenteIndicatorUnit (sem nenhuma mudança nos 3 valores
--    PERCENT/CURRENCY/NUMBER) para ReuniaoIndicatorUnit.
-- 3) Renomeia a tabela GerenteCustomIndicator para ReuniaoCustomIndicator
--    (RENAME preserva linhas, índices e FKs — só o nome muda) e adiciona a
--    coluna "meetingKey": todo indicador que já existe hoje é do Gerente (é
--    a única reunião com esse mecanismo até esta migration), por isso o
--    ADD COLUMN usa DEFAULT 'GERENTE' pra preencher as linhas existentes sem
--    precisar de um UPDATE separado — e o DEFAULT é removido logo em
--    seguida, porque da próxima migration em diante toda linha nova
--    (Salão/Cozinha/Delivery/Liderança) precisa informar o valor real
--    explicitamente (nenhum default implícito faria sentido pra elas).
--    Troca o índice antigo (só empresaId) pelo novo (empresaId + meetingKey),
--    já que toda consulta a partir de agora filtra pelas duas colunas.
-- 4) Mesma renomeação de tabela para GerenteCustomIndicatorValue ->
--    ReuniaoCustomIndicatorValue (sem mudança de coluna: continua sem FK
--    direta pra nenhuma tabela de reunião específica, só pra
--    ReuniaoCustomIndicator via indicatorId — meetingKey já filtra
--    indiretamente por causa disso).
-- 5) Renomeia as constraints/PK/FK pra bater com o nome novo da tabela (só
--    estética/organização — nenhuma delas muda de comportamento).

-- 1) Novo enum: qual das 5 reuniões
CREATE TYPE "ReuniaoMeetingKey" AS ENUM ('GERENTE', 'SALAO', 'COZINHA', 'DELIVERY', 'LIDERANCA');

-- 2) Enum de unidade deixa de ser exclusivo do Gerente
ALTER TYPE "GerenteIndicatorUnit" RENAME TO "ReuniaoIndicatorUnit";

-- 3) GerenteCustomIndicator -> ReuniaoCustomIndicator
ALTER TABLE "GerenteCustomIndicator" RENAME TO "ReuniaoCustomIndicator";
ALTER TABLE "ReuniaoCustomIndicator" RENAME CONSTRAINT "GerenteCustomIndicator_pkey" TO "ReuniaoCustomIndicator_pkey";
ALTER TABLE "ReuniaoCustomIndicator" RENAME CONSTRAINT "GerenteCustomIndicator_empresaId_fkey" TO "ReuniaoCustomIndicator_empresaId_fkey";
ALTER TABLE "ReuniaoCustomIndicator" RENAME CONSTRAINT "GerenteCustomIndicator_createdById_fkey" TO "ReuniaoCustomIndicator_createdById_fkey";

ALTER TABLE "ReuniaoCustomIndicator" ADD COLUMN "meetingKey" "ReuniaoMeetingKey" NOT NULL DEFAULT 'GERENTE';
ALTER TABLE "ReuniaoCustomIndicator" ALTER COLUMN "meetingKey" DROP DEFAULT;

DROP INDEX "GerenteCustomIndicator_empresaId_idx";
CREATE INDEX "ReuniaoCustomIndicator_empresaId_meetingKey_idx" ON "ReuniaoCustomIndicator"("empresaId", "meetingKey");

-- 4) GerenteCustomIndicatorValue -> ReuniaoCustomIndicatorValue (sem mudança de coluna)
ALTER TABLE "GerenteCustomIndicatorValue" RENAME TO "ReuniaoCustomIndicatorValue";
ALTER TABLE "ReuniaoCustomIndicatorValue" RENAME CONSTRAINT "GerenteCustomIndicatorValue_pkey" TO "ReuniaoCustomIndicatorValue_pkey";
ALTER TABLE "ReuniaoCustomIndicatorValue" RENAME CONSTRAINT "GerenteCustomIndicatorValue_indicatorId_fkey" TO "ReuniaoCustomIndicatorValue_indicatorId_fkey";
ALTER INDEX "GerenteCustomIndicatorValue_indicatorId_periodo_key" RENAME TO "ReuniaoCustomIndicatorValue_indicatorId_periodo_key";
