// Subcategoria "Avaliações" do menu CRM — mesma lista de avaliações da pesquisa de Satisfação
// do Cliente já publicada em /portal/satisfacao-cliente/avaliacoes (Fase 4), só que agora
// também com rota própria dentro de CRM (ver migração *_satisfacao_cliente_crm_menu, que
// aninhou esta subcategoria dentro da categoria "crm" no menu lateral, a pedido do Matheus).
//
// Re-export (não redirect) de propósito — ver o comentário completo (mesmo racional) em
// src/app/portal/crm/visao-geral/page.tsx.
//
// O detalhe de uma avaliação (`/portal/satisfacao-cliente/avaliacoes/[id]`, link "Ver" desta
// lista e URL que o push de avaliação crítica já aponta) NÃO precisa de um alias equivalente
// em "/portal/crm/avaliacoes/[id]": o link "Ver" já é um href absoluto para a URL antiga
// (avaliacoes-client.tsx), então continua funcionando normalmente a partir desta lista,
// re-exportada ou não — só o item do MENU (a lista em si) precisava do alias.
export { default } from "@/app/portal/satisfacao-cliente/avaliacoes/page";
