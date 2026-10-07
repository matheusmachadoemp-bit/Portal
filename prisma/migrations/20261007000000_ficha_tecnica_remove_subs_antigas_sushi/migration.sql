-- Complemento de 20261005120000_ficha_tecnica_modalidade_sushi: aquela migration só DESATIVOU
-- (active = false) as 6 subcategorias antigas de tipo-de-prato da Zarki Sushi, mas o menu lateral
-- não esconde subcategoria inativa (só deixa esmaecida) e, desde o conteúdo genérico
-- (categoria-generica), abrir uma dessas URLs mostraria uma área genérica de arquivos em vez de
-- 404. Mesmo padrão das migrations que removeram subcategorias antes (ex.:
-- 20260916060253_remove_cadastro_subcategoria_metas): excluir de verdade.
--
-- Seguro: `Product` usa o enum `ProductCategory` (sem FK pra Subcategory) — os produtos antigos
-- continuam intactos no banco. O único FK pra Subcategory é GenericFileItem, que nunca teve
-- arquivo nessas chaves; mesmo assim a exclusão só vale se nenhum GenericFileItem referenciar a
-- subcategoria (nunca apaga conteúdo por cascata). Linhas de permissão com chave composta
-- (`ficha-tecnica:sushis` etc.) são strings sem FK — ficam órfãs e inofensivas. Idempotente.
DELETE FROM "Subcategory" s
WHERE s."categoryId" = (SELECT "id" FROM "Category" WHERE "key" = 'ficha-tecnica')
  AND s."key" IN ('entradas', 'sashimis', 'sushis', 'temakis', 'uramakis', 'hot-rolls')
  AND NOT EXISTS (SELECT 1 FROM "GenericFileItem" g WHERE g."subcategoryId" = s."id");
