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
 * - Filtro por `hidden` (pedido do Matheus pra "Indicadores" de Produção, depois de ter sido
 *   incorporada à "Visão Geral"): diferente de `active: false`, `hidden: true` nunca aparece no
 *   menu, nem pra admin/gestor. Pensado pra subcategoria permanentemente substituída por outra
 *   tela, sem nenhuma ação de gestão esperada (reativar não faz sentido, excluir não é seguro por
 *   causa de FK — ver comentário de Subcategory.hidden em prisma/schema.prisma). Checado antes do
 *   filtro de `active`, já que uma subcategoria oculta nem precisa do tratamento "esmaecida pro
 *   admin".
 */
export function isSubcategoryVisible(
  sub: SubcategoryDTO,
  opts: { activeEmpresaId: string; isGrupoNord: boolean; isAdmin: boolean }
): boolean {
  if (sub.hidden) return false;
  const empresaOk = !sub.empresaId || opts.isGrupoNord || sub.empresaId === opts.activeEmpresaId;
  const statusOk = sub.active || opts.isAdmin;
  return empresaOk && statusOk;
}
