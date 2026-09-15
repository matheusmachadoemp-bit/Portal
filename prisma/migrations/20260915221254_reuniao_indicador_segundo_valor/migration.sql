-- Indicador "composto" na seção "Fechamento do mês" (ReuniaoCustomIndicator/
-- ReuniaoCustomIndicatorValue, compartilhado pelas 5 reuniões) — permite um
-- indicador registrar 2 valores por período em vez de só 1, cada um com sua
-- própria unidade. Caso motivador: "Cancelamentos" precisa de um percentual
-- (nome/unidade "principais", já existentes) + uma quantidade (atrasos/
-- cancelamentos).
--
-- 3 colunas novas, todas opcionais (sem NOT NULL, sem valor obrigatório) —
-- nenhum backfill necessário: não existe hoje nenhum indicador "Cancelamentos"
-- nem nenhum outro indicador composto em produção; todo indicador já
-- existente continua com só 1 valor por período, sem nenhuma mudança de
-- comportamento.
--
-- ReuniaoCustomIndicator.nomeSecundario/unidadeSecundaria: nome + unidade do
-- segundo valor, quando o indicador tiver um (null nos dois = indicador
-- simples, o padrão). Sempre preenchidos juntos — checado na camada de
-- aplicação (parseSecondaryIndicatorFields em src/lib/reuniao-server.ts), sem
-- CHECK constraint no banco (este schema não usa CHECK constraints em nenhum
-- outro lugar).
--
-- ReuniaoCustomIndicatorValue.valorSecundario: o segundo valor em si, por
-- período — só é gravado quando o indicador correspondente tem
-- unidadeSecundaria configurada (ver upsertReuniaoCustomIndicatorValues).
--
-- Decisão de design (ver relatório da tarefa): NÃO reaproveita o campo
-- `valor` (Float?) já existente em ReuniaoCustomIndicatorValue — apesar de
-- hoje morto (confirmado: nenhuma tela grava nele desde que a Reunião
-- Gerente removeu o único input que escrevia lá, ver
-- 7443e68/20260915181816_reuniao_gerente_metas_proximo_mes na branch de
-- produção) — porque esse campo carrega um significado histórico específico
-- ("Resultado do período", diferente de "Fechamento do mês") que pode voltar
-- a ser usado de verdade no futuro (é um recurso que acabou de ser removido
-- da tela, não um campo que nunca teve uso). Reaproveitá-lo agora para um
-- propósito totalmente diferente arriscaria colisão com uma eventual
-- reintrodução de "Resultado do período" mais tarde. Colunas novas e
-- nomeadas de forma auto-explicativa (valorSecundario/nomeSecundario/
-- unidadeSecundaria) custam 1 coluna a mais que reaproveitar `valor`, mas
-- eliminam essa ambiguidade — e o custo extra é só essa 1 coluna, já que de
-- qualquer forma seria preciso adicionar nomeSecundario/unidadeSecundaria em
-- ReuniaoCustomIndicator em qualquer um dos dois desenhos (não dá pra saber
-- que unidade o segundo valor representa sem isso).

-- AlterTable
ALTER TABLE "ReuniaoCustomIndicator" ADD COLUMN     "nomeSecundario" TEXT,
ADD COLUMN     "unidadeSecundaria" "ReuniaoIndicatorUnit";

-- AlterTable
ALTER TABLE "ReuniaoCustomIndicatorValue" ADD COLUMN     "valorSecundario" DOUBLE PRECISION;
