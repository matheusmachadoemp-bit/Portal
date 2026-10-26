import type { SubcategoryDTO } from "./types";

/**
 * Decide se uma subcategoria deve aparecer na lista renderizada pelo menu lateral
 * (`sidebar.tsx`).
 *
 * - Filtro por loja (já existia): subcategoria com `empresaId` definido (ex.: "Pizzas
 *   Salgadas" da Ficha Técnica) só aparece quando essa é a loja ativa — `empresaId: null`
 *   continua aparecendo sempre. No modo "Grupo Nord" (`isGrupoNord`, várias lojas ao mesmo
 *   tempo) não filtra por loja.
 * - Filtro por status (correção do achado da reestruturação da Ficha Técnica Zarki Sushi):
 *   subcategoria com `active: false` só aparece pra quem é admin/gestor (`isAdmin`) — ainda
 *   esmaecida a 45% de opacidade, ver `SubRow` em `sidebar.tsx`, pra admin saber que ela existe
 *   e poder reativar/excluir pelo menu "⋮". Pra qualquer outro cargo a subcategoria desativada
 *   simplesmente não aparece na lista: antes ela aparecia esmaecida pra todo mundo mas continuava
 *   clicável, e como a rota dela normalmente já não existe mais no mapa de páginas (ex.: as 6
 *   abas antigas de tipo-de-prato da Zarki Sushi antes de serem excluídas), clicar nela dava 404
 *   pra um usuário que nem tem como agir sobre esse estado (só admin/gestor vê a opção
 *   Ativar/Desativar).
 */
export function isSubcategoryVisible(
  sub: SubcategoryDTO,
  opts: { activeEmpresaId: string; isGrupoNord: boolean; isAdmin: boolean }
): boolean {
  const empresaOk = !sub.empresaId || opts.isGrupoNord || sub.empresaId === opts.activeEmpresaId;
  const statusOk = sub.active || opts.isAdmin;
  return empresaOk && statusOk;
}
