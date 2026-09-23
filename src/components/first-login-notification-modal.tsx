"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Bell } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { activatePushSubscription, getPushSupportState } from "@/lib/push-subscription";

const SHOWN_KEY = "first-login-notification-shown";

/**
 * Popup (modal chamativo, não o banner fino) pedindo pra ativar notificações
 * — mostrado só no momento exato do primeiro login de verdade de um usuário.
 * Diferente do `PushPermissionBanner` (discreto, recorrente a cada 7 dias,
 * pra QUALQUER usuário sem push ativo): este aparece uma única vez na vida
 * do usuário. Renderizado uma vez em `src/app/portal/layout.tsx`, ao lado
 * de `PushRegistration`/`PushPermissionBanner`/`IosInstallBanner`.
 *
 * `session.user.isFirstLogin` (ver `src/auth.ts`/`src/types/next-auth.d.ts`)
 * só vem `true` na sessão criada pelo primeiro login de verdade — o próximo
 * login do mesmo usuário já vem `false`. Ainda assim guardamos uma flag em
 * `sessionStorage` assim que decidimos mostrar o popup (não só depois de
 * fechado): um F5 no meio dessa mesma primeira sessão remonta este
 * componente do zero, e `isFirstLogin` continua `true` até a sessão expirar
 * ou a pessoa deslogar (até 8h, `maxAge` em `auth.config.ts`) — sem a flag,
 * o popup reapareceria a cada refresh (navegação normal dentro do portal já
 * não teria esse problema sozinha, porque este layout não desmonta nesse
 * caso — só serve de proteção extra contra o refresh).
 *
 * Cuidado que só apareceu testando ao vivo: o login (`loginAction`, Server
 * Action) faz `signIn()` do lado do servidor + redirect — uma navegação só
 * client-side, sem reload de página. O `SessionProvider` (`src/components/
 * providers.tsx`), montado uma única vez no layout raiz (antes do login
 * acontecer), só busca `/api/auth/session` de novo em foco de janela,
 * intervalo configurado ou evento entre abas (ver `node_modules/next-auth/
 * react.js`) — nenhum desses dispara nessa transição. Resultado: sem o
 * `update()` abaixo, `useSession()` ficava travado em "unauthenticated" (o
 * valor de antes do login) mesmo já dentro de `/portal`, e o popup nunca
 * aparecia. Como este componente só é renderizado dentro de `/portal/
 * layout.tsx` (que já faz `redirect("/login")` no servidor se não houver
 * sessão de verdade), `status === "unauthenticated"` aqui só pode significar
 * esse cache desatualizado — nunca um usuário deslogado de verdade — então é
 * seguro forçar a busca de novo sempre que acontecer.
 */
export function FirstLoginNotificationModal() {
  const { data: session, status, update } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFirstLogin = session?.user?.isFirstLogin === true;

  useEffect(() => {
    // Força o SessionProvider a rebuscar /api/auth/session (ver comentário
    // acima sobre o cache ficar desatualizado logo após o login via Server
    // Action). `update` é do next-auth/react — o lint não precisa de
    // eslint-disable aqui porque não enxerga (nem precisa) o `setState`
    // interno dela.
    if (status !== "unauthenticated") return;
    update();
  }, [status, update]);

  const evaluate = useCallback(async () => {
    if (!isFirstLogin) return;
    if (window.sessionStorage.getItem(SHOWN_KEY)) return;

    // Mesma checagem de suporte do PushPermissionBanner: sem sentido
    // convidar quem já ativou ou cujo navegador não suporta push.
    const support = await getPushSupportState();
    if (!support.supported || support.subscribed) return;

    window.sessionStorage.setItem(SHOWN_KEY, "1");
    setOpen(true);
  }, [isFirstLogin]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- decide, só no cliente, se mostra o popup de primeiro login (depende de sessionStorage e do suporte a push do navegador)
    evaluate();
  }, [evaluate]);

  function handleClose() {
    setOpen(false);
    setError(null);
  }

  async function handleActivate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await activatePushSubscription();
    if (result.ok) {
      setOpen(false);
    } else {
      setError(result.error);
    }
    setBusy(false);
  }

  return (
    <Modal open={open} onClose={handleClose} title="Ative as notificações" widthClass="max-w-sm">
      <div className="flex flex-col items-center text-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-nord-blue/15 flex items-center justify-center shrink-0">
          <Bell size={26} className="text-nord-blue-light" />
        </div>
        <p className="text-sm text-nord-gray leading-relaxed">
          Receba avisos importantes do Portal Nord direto no seu navegador — chamados, atrasos, aprovações e mais.
        </p>
        {error && <p className="text-xs text-nord-warning leading-snug">{error}</p>}
        <div className="flex flex-col gap-2 w-full pt-1">
          <button
            type="button"
            onClick={handleActivate}
            disabled={busy}
            className="w-full bg-nord-blue hover:bg-nord-blue-light disabled:opacity-60 text-white text-sm font-medium rounded-lg py-2.5 transition"
          >
            {busy ? "Ativando..." : "Ativar notificações"}
          </button>
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="w-full text-nord-gray hover:text-white text-sm py-1.5 transition disabled:opacity-60"
          >
            Agora não
          </button>
        </div>
      </div>
    </Modal>
  );
}
