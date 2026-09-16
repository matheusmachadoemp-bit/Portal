-- Generaliza o card "Metas de [próximo mês]" (MetaProximoMes), hoje exclusivo
-- da Reunião Gerente, para as outras 4 reuniões (Salão, Cozinha, Delivery,
-- Liderança) — mesmo raciocínio e mesmo passo a passo já usados em
-- 20260914150000_reuniao_custom_indicador_compartilhado para generalizar
-- ReuniaoCustomIndicator: adiciona a coluna `meetingKey` (enum
-- ReuniaoMeetingKey já existente) com DEFAULT 'GERENTE' só para preencher as
-- linhas já existentes (100% delas são do Gerente, única reunião com este
-- mecanismo até aqui), depois remove o DEFAULT — daqui em diante toda meta
-- nova (de qualquer uma das 5 reuniões) precisa informar `meetingKey`
-- explicitamente, sem valor implícito.
--
-- Troca o índice antigo (empresaId + periodo) pelo novo (empresaId +
-- meetingKey + periodo), já que toda consulta a partir de agora ("metas desta
-- reunião, deste período") filtra pelas três colunas.
--
-- NOTA (fora do escopo desta migration): ao gerar esta migration com
-- `prisma migrate dev`, o diff trouxe de novo o mesmo drift PRÉ-EXISTENTE já
-- documentado em 20260915181816_reuniao_gerente_metas_proximo_mes (3
-- DropForeignKey/AddForeignKey em Sale/SalesEntry/MarketingEntry.createdById,
-- RESTRICT -> SET NULL, + 1 RenameIndex em MetaAdsInsight) — reconfirmado
-- reproduzível sem nenhuma mudança deste agente (reproduz revertendo
-- temporariamente as mudanças de MetaProximoMes e gerando o diff de novo
-- contra o histórico completo). Removido deste arquivo pelo mesmo motivo de
-- antes: não é assunto desta migration.

-- 1) Adiciona a coluna com DEFAULT só para popular as linhas existentes
--    (todas do Gerente) sem precisar de um UPDATE em separado.
ALTER TABLE "MetaProximoMes" ADD COLUMN "meetingKey" "ReuniaoMeetingKey" NOT NULL DEFAULT 'GERENTE';

-- 2) Remove o DEFAULT: da próxima linha em diante, toda meta (de qualquer
--    uma das 5 reuniões) precisa informar `meetingKey` explicitamente.
ALTER TABLE "MetaProximoMes" ALTER COLUMN "meetingKey" DROP DEFAULT;

-- 3) Índice novo (empresaId + meetingKey + periodo) no lugar do antigo
--    (empresaId + periodo).
DROP INDEX "MetaProximoMes_empresaId_periodo_idx";
CREATE INDEX "MetaProximoMes_empresaId_meetingKey_periodo_idx" ON "MetaProximoMes"("empresaId", "meetingKey", "periodo");
