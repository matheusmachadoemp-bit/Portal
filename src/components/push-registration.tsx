"use client";

import { useEffect } from "react";

/**
 * Registra o service worker de push (public/sw.js) em toda navegação
 * autenticada — client component sem nenhuma UI própria (só o `useEffect`).
 *
 * Importante: isso NÃO pede permissão de notificação nem assina o usuário
 * (`pushManager.subscribe`) — só deixa o service worker pronto/instalado no
 * navegador. Pedir permissão e assinar é uma UI de opt-in (botão/toggle nas
 * configurações do usuário), etapa seguinte, que vai chamar
 * POST /api/push/subscribe com o resultado de `subscribe()`.
 */
export function PushRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("[push] falha ao registrar o service worker:", err);
    });
  }, []);

  return null;
}
