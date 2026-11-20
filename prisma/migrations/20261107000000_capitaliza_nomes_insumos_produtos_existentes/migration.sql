-- Normaliza retroativamente a primeira letra de "Ingredient"."name" (Insumos) e "Product"."name"
-- (Produtos/Combos — Product.category = COMBO é um dos valores possíveis, mas aqui normalizamos
-- TODAS as categorias de produto, já que é o mesmo campo/mesma tela/mesma regra pra todas as abas
-- da Ficha Técnica, não só "Combos" — ver decisão documentada no relatório da tarefa).
--
-- Motivação: cadastros feitos ANTES da regra de capitalização automática (ver src/lib/text.ts e as
-- rotas POST/PATCH de /api/ficha-tecnica/insumos e /api/ficha-tecnica/produtos, que passam a
-- normalizar todo item criado/editado a partir de agora) continuam com a primeira letra minúscula.
-- Isso não é só estético: o Postgres ordena `ORDER BY name ASC` com colação padrão CASE-SENSITIVE
-- (maiúscula < minúscula na tabela ASCII), então qualquer nome que comece com minúscula "cai pro
-- final" da lista, dividindo a listagem em dois blocos em vez de alfabética de verdade — o bug que
-- o usuário reportou. Sem este backfill, os itens já cadastrados continuariam nesse estado até
-- cada um ser editado manualmente, um a um.
--
-- Só toca o PRIMEIRO caractere de cada nome (upper() nele + o resto do nome sem alteração) — não
-- aplica Title Case no restante da string, mesmo critério usado na normalização da aplicação (uma
-- sigla ou nome próprio no meio do nome não é afetado). `upper()` nesta instância do Postgres já
-- lida corretamente com acentuação Unicode (testado ao vivo: "ábaco" -> "Ábaco", "ômega" ->
-- "Ômega"). Nomes que já começam com maiúscula, com um caractere que não é letra (dígito, símbolo,
-- emoji) ou vazios não são afetados — o WHERE só pega as linhas onde `upper()` do primeiro
-- caractere realmente muda alguma coisa.

UPDATE "Ingredient"
SET name = upper(substring(name from 1 for 1)) || substring(name from 2)
WHERE name <> '' AND upper(substring(name from 1 for 1)) <> substring(name from 1 for 1);

UPDATE "Product"
SET name = upper(substring(name from 1 for 1)) || substring(name from 2)
WHERE name <> '' AND upper(substring(name from 1 for 1)) <> substring(name from 1 for 1);
