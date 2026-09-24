// Subcategoria "Visão Geral (Satisfação)" do menu CRM — mesma página do dashboard de
// Satisfação do Cliente já publicada em /portal/satisfacao-cliente/visao-geral (Fase 4), só
// que agora também com rota própria dentro de CRM (ver migração
// *_satisfacao_cliente_crm_menu, que aninhou esta subcategoria dentro da categoria "crm" no
// menu lateral, a pedido do Matheus).
//
// Re-export (não redirect) de propósito, mesmo padrão já usado em
// src/app/portal/vendas/visao-geral/page.tsx e src/app/portal/tarefas/tarefas/page.tsx: o link
// do menu é montado como `/portal/${categoria.key}/${subcategoria.key}`
// (src/components/sidebar/sidebar.tsx) — sem isto, "/portal/crm/visao-geral" seria um link
// morto (404), já que a pasta de rota real é "satisfacao-cliente/visao-geral". Um redirect (como
// src/app/portal/crm/dashboard/page.tsx faz para a bare URL "/portal/crm") NÃO serve aqui: ele
// trocaria a URL de volta para "/portal/satisfacao-cliente/visao-geral", e a checagem de item
// ativo do menu (`pathname === "/portal/${cat.key}/${sub.key}"`, mesmo arquivo do sidebar)
// deixaria de destacar "Visão Geral (Satisfação)" como selecionado dentro de CRM. Com
// re-export, a URL do menu ("/portal/crm/visao-geral") permanece no navegador e renderiza o
// mesmo componente de servidor de sempre — inclusive o mesmo gate de permissão
// (`hasModulePermission(..., "crm", "canView", "visao-geral")`, já apontando para o módulo
// "crm" desde esta mudança de menu).
//
// URLs antigas (`/portal/satisfacao-cliente/visao-geral`, já usada por notificações, pelo
// alerta da Tela de Início e pelo dashboard do CRM) continuam funcionando sem nenhuma mudança —
// a pasta original não foi movida, só ganhou este alias.
export { default } from "@/app/portal/satisfacao-cliente/visao-geral/page";
