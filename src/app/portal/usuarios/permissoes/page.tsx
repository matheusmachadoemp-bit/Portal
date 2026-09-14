import { redirect } from "next/navigation";

// Tela desativada a pedido: permissão passou a ser controlada só pelo perfil escolhido ao
// criar/editar um usuário (Usuários > Novo usuário > "Perfil de permissão"), sem uma tela
// separada para editar a matriz de permissões de cada perfil. O componente
// (./permissoes-client.tsx) e as rotas de API continuam intactos — só o acesso a esta
// página foi cortado, pra facilitar reativar no futuro se precisar.
export default async function PermissoesPage() {
  redirect("/portal/usuarios");
}
