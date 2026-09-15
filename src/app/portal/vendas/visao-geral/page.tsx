// Subcategoria "Visão Geral" (menu lateral) — mesma página principal servida em
// /portal/vendas, só que agora com rota própria: a categoria "Vendas" deixou de ter link
// direto (ver migração 20260915140000_vendas_visao_geral_subcategoria) e virou só um
// agrupador no menu. Mesmo padrão já usado em src/app/portal/tarefas/tarefas/page.tsx
// para a subcategoria "Tarefas".
export { default } from "../page";
