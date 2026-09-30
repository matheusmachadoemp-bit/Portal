-- A pedido do usuário (tela Estoque > Fornecedores), 3 mudanças no model Supplier:
--
-- 1. Remove "Pedido mínimo" (`pedidoMinimo`) e "Avaliação" (`avaliacao`) — confirmado
--    (busca em todo o codebase: rotas de API, outras telas, seed, scripts) que os dois
--    campos só eram lidos/gravados na própria tela de Fornecedores (form de criar/editar,
--    coluna da tabela) e no card "Ranking de fornecedores (avaliação)" no topo da mesma
--    tela — nenhum outro módulo do Portal depende deles. Tela (colunas + card) removida à
--    parte, pelo Caio, a partir desta mesma branch.
--
-- 2. Troca `prazoEntregaDias` (Int?, quantidade de dias de prazo de entrega) por
--    `diasEntregaSemana` (Int[], quais dias da semana o fornecedor costuma entregar —
--    0 = domingo .. 6 = sábado, mesmo vocabulário já usado por
--    `StoreClosedWeekday`/`ProductionWeekdayWeight`/`spWeekday`, ver src/lib/checklist.ts).
--
-- PERDA DE DADO INTENCIONAL nesta troca: prazo (quantos dias até entregar) e dia da
-- semana (quais dias entrega) são conceitos diferentes — não existe conversão automática
-- correta de um valor já cadastrado (ex.: 21 dias, fornecedor "Top Alto" do seed) para um
-- conjunto de dias da semana. Os fornecedores já cadastrados ficam com `diasEntregaSemana`
-- vazio (`{}`, "sem dia de entrega definido") até alguém preencher de novo manualmente
-- pela tela — aceito e esperado, avisado no pedido original.
-- AlterTable
ALTER TABLE "Supplier" DROP COLUMN "avaliacao",
DROP COLUMN "pedidoMinimo",
DROP COLUMN "prazoEntregaDias",
ADD COLUMN     "diasEntregaSemana" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
