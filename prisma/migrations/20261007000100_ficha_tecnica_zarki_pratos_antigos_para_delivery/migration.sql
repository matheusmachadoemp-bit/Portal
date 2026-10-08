-- A pedido do Matheus (opção B): os pratos da Zarki Sushi cadastrados nas categorias antigas de
-- tipo-de-prato (Sushi, Sashimi, Temaki, Uramaki, Hot Roll, Entrada) — e também "Sobremesa", que
-- deixou de ser compartilhada e passou a ser só da Nord Pizza — ficariam sem nenhuma aba na Ficha
-- Técnica (as subcategorias antigas foram removidas), sem como editar ou excluir. Eles são movidos
-- para a modalidade "Delivery"; depois o Matheus separa cada um entre Delivery / À La Carte /
-- Rodízio pela própria tela (editar produto > Categoria).
--
-- Migration SEPARADA de 20261005120000_ficha_tecnica_modalidade_sushi de propósito: aquela cria o
-- valor 'DELIVERY' no enum (ALTER TYPE ... ADD VALUE) e o Postgres não deixa USAR um valor de enum
-- na mesma transação em que ele foi criado (erro 55P04). Cada migration roda em transação própria.
--
-- Só toca produtos da Zarki (`Empresa.key = 'zarki-sushi'`); a Nord Pizza não é afetada. Muda
-- apenas a categoria — código, nome, preço e ficha técnica ficam intactos. Idempotente: depois da
-- primeira execução não sobra nenhum produto da Zarki nas categorias antigas.
UPDATE "Product"
SET "category" = 'DELIVERY', "updatedAt" = CURRENT_TIMESTAMP
WHERE "empresaId" = (SELECT "id" FROM "Empresa" WHERE "key" = 'zarki-sushi')
  AND "category" IN ('SUSHI', 'SASHIMI', 'TEMAKI', 'URAMAKI', 'HOT_ROLL', 'ENTRADA', 'SOBREMESA');
