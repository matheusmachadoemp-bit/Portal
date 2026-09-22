import { ShieldAlert } from "lucide-react";

interface AccessDeniedProps {
  /** Mensagem principal — deve deixar claro que o motivo é falta de permissão, não um erro. */
  message: string;
}

/**
 * Estado de "acesso restrito" para uma página inteira, usado no lugar de um
 * `redirect()` silencioso quando um usuário logado tenta abrir uma tela para
 * a qual não tem permissão. Sem isso, a experiência é "a tela pisca e volta
 * pro Início do nada" — o usuário não consegue distinguir isso de um bug.
 *
 * Ver task #291 (achado do Jonas): usuária com cargo COLABORADOR reportou
 * telas em branco no RH porque `redirect("/portal/inicio")` não avisava o
 * motivo, mesmo com o item de menu de RH visível e clicável para ela.
 */
export function AccessDenied({ message }: AccessDeniedProps) {
  return (
    <div className="nord-card p-10 flex flex-col items-center text-center gap-4">
      <div className="w-14 h-14 rounded-2xl bg-nord-warning/15 flex items-center justify-center">
        <ShieldAlert size={26} className="text-nord-warning" />
      </div>
      <div>
        <p className="text-white font-medium text-base mb-1">Acesso restrito</p>
        <p className="text-nord-gray text-sm max-w-md mx-auto">{message}</p>
      </div>
    </div>
  );
}
