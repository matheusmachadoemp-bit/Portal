-- ============================================================================================================
-- RESET DE FATURAMENTO (Nord Pizza + Zarki Sushi), a pedido do Matheus: os dados de vendas/pedidos/Curva ABC
-- hoje têm uma mistura de dado fictício (seed) com dado real, sem como separar um do outro com segurança.
-- Ele vai reimportar tudo a partir de arquivos reais que já tem em mãos, então decidiu apagar tudo e começar
-- do zero em vez de tentar filtrar linha a linha. Confirmado explicitamente: SEM backup antes de apagar (ele
-- disse que não vai precisar dos dados de vendas da Saipos existentes).
--
-- Sem mudança de schema aqui — só DML (DELETE + um UPDATE), por isso não mexe no schema.prisma.
--
-- Escopo (as únicas duas empresas do sistema, mas delimitado explicitamente por key em vez de confiar nisso):
--   - SalesEntry        (faturamento + contagem de pedidos lançados por dia, manual ou Saipos)
--   - Sale              (venda por venda; SaleItem cascata automaticamente via onDelete: Cascade)
--   - SaiposSale        (cache bruto de cada sincronização com a Saipos)
--   - ImportedSaleItem  (planilha "Itens e Opções" da Saipos — alimenta Itens Vendidos / Curva ABC)
--   - ImportedGarcomItem (planilha "Desempenho por garçom" da Saipos)
--
-- Fora do escopo, de propósito: SaiposSyncLog (histórico de execuções da sincronização — log técnico, não é
-- dado de faturamento) continua intacto.
-- ============================================================================================================

DELETE FROM "Sale"
 WHERE "empresaId" IN (SELECT "id" FROM "Empresa" WHERE "key" IN ('nord-pizza', 'zarki-sushi'));

DELETE FROM "SalesEntry"
 WHERE "empresaId" IN (SELECT "id" FROM "Empresa" WHERE "key" IN ('nord-pizza', 'zarki-sushi'));

DELETE FROM "SaiposSale"
 WHERE "empresaId" IN (SELECT "id" FROM "Empresa" WHERE "key" IN ('nord-pizza', 'zarki-sushi'));

DELETE FROM "ImportedSaleItem"
 WHERE "empresaId" IN (SELECT "id" FROM "Empresa" WHERE "key" IN ('nord-pizza', 'zarki-sushi'));

DELETE FROM "ImportedGarcomItem"
 WHERE "empresaId" IN (SELECT "id" FROM "Empresa" WHERE "key" IN ('nord-pizza', 'zarki-sushi'));

-- Desativa a integração Saipos sem remover o sistema de integração em si: a própria rota de sincronização
-- (src/app/api/integracoes/saipos/sync/route.ts) já filtra `saiposApiToken: { not: null }`, então limpar o
-- token já é suficiente pra parar a sincronização — nenhuma mudança de código é necessária. Zera também
-- `saiposLastSyncAt` (não faz sentido manter a data da última sincronização de um histórico que acabou de
-- ser apagado) e `saiposSyncEnabled` (deixa o estado explicitamente "desativado" na tela de Configurações,
-- não só "sem token"). `saiposLojaId` é mantido — não é segredo, é só o identificador da loja na Saipos,
-- útil pra quando a chave nova for cadastrada de novo.
UPDATE "Empresa"
   SET "saiposApiToken" = NULL,
       "saiposSyncEnabled" = false,
       "saiposLastSyncAt" = NULL
 WHERE "key" IN ('nord-pizza', 'zarki-sushi');
