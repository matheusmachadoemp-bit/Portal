/**
 * Utilitários de texto para nomes de cadastro (Insumos, Produtos/Combos da Ficha Técnica e
 * qualquer outra lista futura que precise do mesmo tratamento).
 *
 * Contexto do bug que gerou este arquivo: o Postgres (e o Prisma, que só traduz pro SQL) ordena
 * `orderBy: { name: "asc" }` usando a colação padrão do banco, que é CASE-SENSITIVE — todo valor
 * que começa com letra maiúscula vem antes de QUALQUER valor que comece com minúscula na tabela
 * ASCII (ex.: "Zebra" vem antes de "abacate"). Isso faz a lista parecer "dividida em dois blocos"
 * em vez de alfabética de verdade, exatamente o que o usuário percebeu na aba de Insumos. O Prisma
 * (nesta versão, 7.x) só aceita `mode: "insensitive"` em filtros `where`, não em `orderBy` (ver
 * `SortOrderInput` gerado em node_modules/.prisma/client — só tem `sort`/`nulls`, sem `mode`) —
 * não tem como pedir pro Postgres já devolver ordenado certo sem mudar a colação da coluna (fora
 * de escopo: afetaria igualdade/índices em todo o banco). A correção é ordenar em memória, no
 * servidor, depois da query.
 */

/**
 * Comparador alfabético "de verdade" pra nomes em português: ignora a diferença entre maiúscula/
 * minúscula (ex.: "abacate" entre "Zebra" e "Banana" fica na posição certa), mas mantém acento
 * como critério de ordenação (não é a mesma coisa que `normalizeProductName` em `ficha-nome.ts`,
 * que ignora acento de propósito pra comparar "é o mesmo nome?" — aqui o objetivo é só ordenar uma
 * lista pra exibição, então diferenciar "é"/"e" na ordem é o esperado).
 */
export function compareNomePtBr(a: string, b: string): number {
  return a.localeCompare(b, "pt-BR");
}

/**
 * Devolve uma NOVA lista (não muta `items`) ordenada pelo campo `name`, usando `compareNomePtBr`.
 * `Array.prototype.sort` é estável (garantido pela especificação ECMA-262), então dois itens com o
 * mesmo nome mantêm a ordem relativa que já vieram do banco (ex.: por `createdAt`/`id`).
 */
export function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => compareNomePtBr(a.name, b.name));
}

/**
 * Normaliza a primeira letra de um nome para maiúscula, em silêncio (sem rejeitar/avisar o
 * usuário — só ajusta o que foi digitado antes de salvar). Padrão definido a pedido do Matheus
 * para todo item criado em Insumos e Produtos/Combos da Ficha Técnica: além de ficar mais
 * apresentável, evita que o mesmo tipo de item fique "dividido em dois blocos" na lista por causa
 * da ordenação ASCII (ver comentário do arquivo).
 *
 * Só toca o primeiro caractere — não aplica Title Case no resto do nome (um nome como "pizza de
 * calabresa" vira "Pizza de calabresa", não "Pizza De Calabresa"), de propósito: siglas, nomes
 * próprios e preposições no meio do nome continuam exatamente como quem cadastrou digitou.
 */
export function capitalizeFirstLetter(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
