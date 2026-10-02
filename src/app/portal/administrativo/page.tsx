import { redirect } from "next/navigation";
import { auth } from "@/auth";

/**
 * Item #7c (achado de revisão 02/10/2026): "Senhas" é a primeira subtela na ordem do
 * menu lateral, mas é restrita a ADMINISTRADOR/GESTOR por cargo (mesma checagem de
 * src/app/portal/administrativo/senhas/page.tsx, .../cursos/page.tsx e
 * .../arquivos/page.tsx). Pra qualquer outro cargo (ex.: Supervisor), redirecionar
 * sempre pra "Senhas" só gerava um redirecionamento em cadeia: Senhas nega o acesso e
 * manda pra Início, nunca abrindo nenhuma subtela de Administrativo de fato — o mesmo
 * bug que o resto dos módulos (ex. Manutenção) não tem, porque a subtela de destino do
 * redirect não tem uma checagem de cargo mais restritiva que a da categoria em si.
 * "Cartilhas" (próxima subtela sem essa restrição extra) é o destino pra todo o resto.
 */
export default async function AdministrativoRoot() {
  const session = await auth();
  const isAdminOuGestor = session?.user?.role === "ADMINISTRADOR" || session?.user?.role === "GESTOR";
  redirect(isAdminOuGestor ? "/portal/administrativo/senhas" : "/portal/administrativo/cartilhas");
}
