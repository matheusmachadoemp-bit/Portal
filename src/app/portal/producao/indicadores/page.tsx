import { redirect } from "next/navigation";

// A subcategoria "Indicadores" foi incorporada à tela "Visão Geral" (pedido do usuário: "pegar a
// categoria Indicadores e jogar pra Visão Geral, unificar as categorias" — ver
// src/app/portal/producao/page.tsx). Essa rota deixou de existir como tela própria, mas a
// subcategoria no menu lateral continua cadastrada como `active: false` (visível só pra
// admin/gestor, esmaecida, até alguém excluí-la pelo menu "⋮") e ainda aponta pra esta URL — um
// redirect simples evita que esse clique quebre em vez de simplesmente não existir mais.
export default function ProducaoIndicadoresRedirect() {
  redirect("/portal/producao/visao-geral");
}
