import { redirect } from "next/navigation";

/**
 * Redirecionamento de compatibilidade — a tela do formulário do cargo mudou de
 * /portal/fechamento-dia/[cargoId] para /portal/tarefas/ocorrencias/[cargoId] (categoria
 * "Fechamento do Dia" removida, conteúdo unificado dentro de "Tarefas" > "Ocorrências").
 *
 * Este caminho antigo continua existindo só porque src/lib/fechamento-server.ts (fora do escopo
 * desta tela — grava notificação no banco) ainda monta o link de "Fechamento do Dia não enviado
 * no prazo" apontando para cá, então notificações antigas já enviadas com esse link precisam
 * continuar funcionando. Quando aquele arquivo for atualizado para gerar o link novo direto,
 * esta página de redirecionamento pode ser removida.
 */
export default async function FechamentoDiaCargoRedirectPage({ params }: { params: Promise<{ cargoId: string }> }) {
  const { cargoId } = await params;
  redirect(`/portal/tarefas/ocorrencias/${cargoId}`);
}
