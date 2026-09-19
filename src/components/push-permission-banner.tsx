"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { activatePushSubscription, getPushSupportState } from "@/lib/push-subscription";

const DISMISSED_AT_KEY = "push-banner-dismissed-at";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

function isSnoozed(): boolean {
  const raw = window.localStorage.getItem(DISMISSED_AT_KEY);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  if (!Number.isFinite(dismissedAt)) return false;
  return Date.now() - dismissedAt < SNOOZE_MS;
}

type BannerState = "hidden" | "prompt" | "blocked";

/**
 * Banner discreto no topo pedindo pra ativar notificações push — em vez de
 * depender de o usuário descobrir sozinho o botão "Ativar notificações"
 * escondido dentro do menu de perfil (`src/components/topbar/user-menu.tsx`).
 * Renderizado uma vez em `src/app/portal/layout.tsx`, ao lado de
 * `PushRegistration` e `IosInstallBanner`.
 *
 * Não é possível forçar a permissão do navegador via servidor — só o próprio
 * usuário pode conceder. Isto só reduz a fricção pra chegar nesse convite.
 *
 * Quando aparece: navegador com suporte a push E (permissão ainda não
 * decidida OU concedida mas sem assinatura ativa de verdade) — mesma
 * checagem usada no menu de perfil, via `getPushSupportState` (extraída de
 * lá pra não duplicar). Se a permissão já foi negada, mostra só um aviso
 * curto de como liberar (sem botão, já que "Ativar" não adiantaria nada).
 *
 * Fechar (X) grava o horário em `localStorage` e o banner some por 7 dias —
 * depois volta a aparecer se a pessoa ainda não tiver ativado.
 */
export function PushPermissionBanner() {
  const [state, setState] = useState<BannerState>("hidden");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const evaluate = useCallback(async () => {
    if (isSnoozed()) {
      setState("hidden");
      return;
    }
    const support = await getPushSupportState();
    if (!support.supported || support.subscribed) {
      setState("hidden");
      return;
    }
    setState(support.permission === "denied" ? "blocked" : "prompt");
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- decide, só no cliente, se mostra o convite pra ativar (depende de Notification/serviceWorker do navegador e do que o usuário já dispensou antes)
    evaluate();
  }, [evaluate]);

  function dismiss() {
    window.localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
    setState("hidden");
  }

  async function handleActivate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await activatePushSubscription();
    if (result.ok) {
      // Esconde só nesta sessão — não precisa gravar no localStorage: ao
      // recarregar, `evaluate()` já não mostra mais o banner porque vai
      // encontrar uma assinatura ativa de verdade.
      setState("hidden");
    } else {
      setError(result.error);
    }
    setBusy(false);
  }

  if (state === "hidden") return null;

  return (
    <div className="bg-nord-blue/10 border-b border-nord-blue/25 px-4 md:px-6 py-2.5">
      <div className="flex items-center gap-3">
        <Bell size={16} className="text-nord-blue-light shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm text-white leading-snug">
            {state === "blocked"
              ? "As notificações estão bloqueadas neste navegador. Libere nas configurações do site para ativar."
              : "Ative as notificações para não perder avisos importantes do Portal."}
          </p>
          {error && <p className="text-xs text-nord-warning leading-snug mt-0.5">{error}</p>}
        </div>
        {state === "prompt" && (
          <button
            type="button"
            onClick={handleActivate}
            disabled={busy}
            className="shrink-0 px-3 py-1.5 rounded-lg text-xs bg-nord-blue hover:bg-nord-blue-light text-white font-medium disabled:opacity-60 transition"
          >
            {busy ? "Ativando..." : "Ativar"}
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Fechar aviso"
          className="shrink-0 text-nord-gray hover:text-white p-1 -m-1 rounded-lg hover:bg-white/10 transition"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
