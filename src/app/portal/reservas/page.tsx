import { redirect } from "next/navigation";

// Raiz de "Reservas" (categoria com subcategorias — o clique no menu lateral só expande/
// recolhe, nunca navega pra cá; esta rota só é alcançada por URL direta ou pelo link
// "← Reservas" no topo de qualquer subcategoria, via `backHref` do `PageContainer`).
//
// Até a tarefa "reservas-voltar-raiz", isto renderizava `<GenericModulePage categoryKey="reservas" />`
// — conteúdo genérico de fallback criado na Etapa 1, antes de existir qualquer tela de verdade —
// fazendo o "← Reservas" de todas as 6 subcategorias cair numa tela com cara de quebrada em vez
// de voltar pra algum lugar útil. Agora redireciona direto pra "Visão Geral" (a home natural do
// módulo), mesmo padrão já usado pela raiz de "Financeiro" (src/app/portal/financeiro/page.tsx:
// redirect incondicional, sem checagem de permissão aqui) — a própria tela de destino
// (src/app/portal/reservas/visao-geral/page.tsx) já faz `hasModulePermission(..., "reservas",
// "canView")` e manda pra "/portal/inicio" quem não tiver acesso, então duplicar a checagem aqui
// só adicionaria uma consulta ao banco (resolver a sessão + a permissão) sem nenhum ganho: quem
// não tem permissão é barrado do mesmo jeito, só que um passo depois.
export default function ReservasRootPage() {
  redirect("/portal/reservas/visao-geral");
}
