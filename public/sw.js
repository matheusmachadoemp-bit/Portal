// Service worker do Portal Nord — por enquanto cuida só de notificação push
// (infraestrutura de PWA, etapa 2). Registrado por
// src/components/push-registration.tsx em toda navegação autenticada.
// Pedir permissão de notificação e assinar (pushManager.subscribe) é uma UI
// de opt-in à parte (próxima etapa) — este arquivo só reage a pushes de
// assinaturas que já existem.

self.addEventListener("install", () => {
  // Ativa a versão nova do worker assim que instalada, sem esperar todas as
  // abas antigas fecharem.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: "Portal Nord", body: event.data.text() };
    }
  }

  const title = data.title || "Portal Nord";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/portal" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/portal";
  const targetUrl = new URL(url, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Já tem uma aba do Portal aberta exatamente nessa URL: só foca ela.
      for (const client of windowClients) {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }
      // Nenhuma aba na URL exata, mas tem alguma aba do Portal aberta:
      // reaproveita a primeira, navegando até a URL certa.
      for (const client of windowClients) {
        if ("navigate" in client && "focus" in client) {
          return client.navigate(targetUrl).then((navigated) => navigated && navigated.focus());
        }
      }
      // Nenhuma aba aberta: abre uma nova.
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
