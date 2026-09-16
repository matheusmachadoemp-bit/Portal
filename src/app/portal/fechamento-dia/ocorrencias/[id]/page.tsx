import { redirect } from "next/navigation";

/**
 * Redirecionamento de compatibilidade — a gestão de ocorrências mudou de
 * /portal/fechamento-dia/ocorrencias para /portal/tarefas/ocorrencias (categoria
 * "Fechamento do Dia" removida, subcategoria "Ocorrências" movida para dentro de "Tarefas").
 *
 * Este caminho antigo (com um [id] de ocorrência no final) continua existindo só porque
 * src/lib/fechamento-server.ts (fora do escopo desta tela — grava notificação no banco) ainda
 * monta o link da notificação "Ocorrência crítica no Fechamento do Dia" apontando para cá, então
 * notificações antigas já enviadas com esse link precisam continuar funcionando. Quando aquele
 * arquivo for atualizado para gerar o link novo direto, esta página de redirecionamento pode ser
 * removida.
 *
 * Observação: não existe (nem existia antes desta tarefa) uma tela de detalhe de uma ocorrência
 * por id — a rota antiga (/portal/fechamento-dia/ocorrencias/[id]) já dava 404 antes desta
 * unificação, já que só havia um `page.tsx` de lista em .../ocorrencias, sem `[id]`. O
 * redirecionamento abaixo segue o padrão orientado pelo líder para este caso (preserva o [id] na
 * URL, apontando para /portal/tarefas/ocorrencias/[id]) — como esse caminho colide com a rota
 * [cargoId] do formulário do cargo, o resultado prático é a tela do formulário tentando (e
 * falhando) carregar um "cargo" com esse id, mostrando um erro amigável de carregamento em vez
 * de um 404 cru. Reportado ao líder como ponto de atenção: o ideal a médio prazo é
 * src/lib/fechamento-server.ts passar a gerar essa notificação apontando direto para
 * /portal/tarefas/ocorrencias (a lista), já que não existe tela de detalhe por id.
 */
export default async function FechamentoDiaOcorrenciaRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/portal/tarefas/ocorrencias/${id}`);
}
