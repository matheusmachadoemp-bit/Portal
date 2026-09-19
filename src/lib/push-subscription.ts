/**
 * Lógica de notificações push compartilhada entre o menu de perfil
 * (`src/components/topbar/user-menu.tsx`) e o banner de permissão
 * (`src/components/push-permission-banner.tsx`) — client-side puro: só usa
 * APIs do navegador (Notification, serviceWorker, PushManager) e chama a
 * rota `POST /api/push/subscribe`, que já existe e já é usada pelo menu.
 * Não grava nada diretamente em banco.
 *
 * De propósito, isto cobre só o caminho de **ativação** (checar suporte,
 * checar assinatura ativa, pedir permissão + assinar). O caminho de
 * **desativação** (unsubscribe) é mais simples e continua só dentro de
 * `user-menu.tsx` — não há nenhum outro lugar do app que precise desativar.
 */

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export type PushSupportState = {
  /** Falso quando o navegador não tem as APIs de push (ex.: Safari do
   * iPhone fora do modo instalado — ver `IosInstallBanner`). */
  supported: boolean;
  /** Permissão atual do navegador (`default`/`granted`/`denied`). `null`
   * quando `supported` é falso. */
  permission: NotificationPermission | null;
  /** Permissão concedida E existe uma assinatura ativa de verdade — a
   * permissão sozinha não basta, por isso confere `pushManager.getSubscription()`. */
  subscribed: boolean;
};

/**
 * Confere suporte + permissão + assinatura ativa de verdade. Usado pelo menu
 * de perfil (pra decidir o rótulo do botão "Ativar/Desativar notificações")
 * e pelo banner (pra decidir se aparece).
 */
export async function getPushSupportState(): Promise<PushSupportState> {
  if (!isPushSupported()) return { supported: false, permission: null, subscribed: false };

  const permission = Notification.permission;
  if (permission !== "granted") return { supported: true, permission, subscribed: false };

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return { supported: true, permission, subscribed: !!subscription };
  } catch {
    return { supported: true, permission, subscribed: false };
  }
}

/**
 * Converte a chave pública VAPID — que chega em base64url via
 * `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — em `Uint8Array`. `PushManager.subscribe`
 * exige `applicationServerKey` em bytes, não a string em si; esta é a
 * implementação padrão usada em qualquer exemplo de Web Push.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

export type PushActivationResult = { ok: true } | { ok: false; error: string };

/**
 * Pede permissão de notificação (se ainda não decidida) e assina o
 * navegador via `POST /api/push/subscribe`. Mesmo fluxo e mesmas mensagens
 * que existiam em `UserMenu.handleToggleNotifications` antes desta extração
 * — cobre só o "caminho de ativação" (o toggle completo, incluindo
 * desativar, continua em `user-menu.tsx`). Nunca lança para fora: qualquer
 * falha vira `{ ok: false, error }` com uma mensagem curta pra mostrar ao
 * usuário.
 */
export async function activatePushSubscription(): Promise<PushActivationResult> {
  if (!isPushSupported()) {
    return { ok: false, error: "Notificações push não estão disponíveis neste navegador." };
  }

  if (Notification.permission === "denied") {
    return {
      ok: false,
      error:
        "As notificações estão bloqueadas para o Portal neste navegador. Libere manualmente nas configurações do site (ou do celular) para ativar.",
    };
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return { ok: false, error: "Notificações push não estão disponíveis neste ambiente." };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return {
        ok: false,
        error:
          permission === "denied"
            ? "Permissão negada. Para ativar depois, libere notificações para o Portal nas configurações do navegador."
            : "Permissão não concedida — tente novamente quando quiser ativar.",
      };
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const keys = subscription.toJSON().keys;
    if (!keys?.p256dh || !keys?.auth) {
      return { ok: false, error: "Não foi possível concluir a ativação (dados da assinatura incompletos)." };
    }

    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }),
    });
    if (!res.ok) {
      return { ok: false, error: "Não foi possível concluir a ativação agora. Tente novamente em instantes." };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "Não foi possível ativar as notificações agora. Tente novamente em instantes." };
  }
}
