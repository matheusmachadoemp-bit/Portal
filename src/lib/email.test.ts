import { test } from "node:test";
import assert from "node:assert/strict";

// `RESEND_API_KEY` só precisa existir pra passar pela checagem de `getClient()` em
// `src/lib/email.ts` — nunca chega a ser usada numa chamada de rede real (`fetch` é
// substituído abaixo), então um valor fictício é seguro aqui.
process.env.RESEND_API_KEY = "test_key_do_not_use";

import { sendReservationAcceptedEmail, sendReservationCancelledEmail } from "@/lib/email";

const originalFetch = globalThis.fetch;
let lastRequestBody: { html?: string } | null = null;

/** Substitui o `fetch` global (usado pelo SDK da Resend por baixo dos panos — ver
 * `node_modules/resend/dist/index.mjs`, `fetchRequest`) por um dublê que captura o corpo
 * da requisição (onde vai o HTML final do e-mail) sem bater na rede de verdade — não há
 * chave real da Resend configurada neste ambiente de teste, e não precisa haver: o que
 * importa pra este teste é o HTML que o Portal Nord monta ANTES de mandar pra Resend. */
function installFetchMock() {
  lastRequestBody = null;
  globalThis.fetch = (async (_url: string | URL | Request, options?: RequestInit) => {
    lastRequestBody = options?.body ? JSON.parse(options.body as string) : null;
    return new Response(JSON.stringify({ id: "test-id" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

const baseDetails = {
  empresaName: "Pizzaria Teste",
  environmentName: "Salão",
  dateBR: "01/01/2026",
  timeHHMM: "20:00",
  partySize: 4,
};

test(
  "sendReservationAcceptedEmail escapa HTML no nome do cliente (achado de segurança do Jonas, " +
    "tarefa #187 — reserva pública sem login permitia montar e-mail com link/script disfarçado " +
    "de 'nome', disparado pro destinatário escolhido pelo atacante usando o remetente legítimo " +
    "do Portal Nord)",
  async () => {
    installFetchMock();
    try {
      const malicious = '<a href="https://evil.example/phish">clique aqui</a><script>alert(1)</script>';
      await sendReservationAcceptedEmail("victim@example.com", {
        ...baseDetails,
        customerName: malicious,
      });

      assert.ok(lastRequestBody, "deveria ter chamado fetch com o corpo da requisição");
      const html = lastRequestBody!.html ?? "";
      assert.ok(html.length > 0, "html não deveria estar vazio");
      // O link/script não deve sobreviver como tag/atributo de verdade no HTML final.
      assert.ok(!html.includes('<a href="https://evil.example/phish">'), "link malicioso não deveria renderizar como link de verdade");
      assert.ok(!html.includes("<script>"), "script não deveria sobreviver como tag executável");
      // E deve aparecer como texto literal escapado.
      assert.ok(
        html.includes(
          "&lt;a href=&quot;https://evil.example/phish&quot;&gt;clique aqui&lt;/a&gt;&lt;script&gt;alert(1)&lt;/script&gt;"
        ),
        "nome do cliente deveria aparecer escapado como texto literal"
      );
    } finally {
      restoreFetch();
    }
  }
);

test("sendReservationCancelledEmail escapa HTML no nome do cliente", async () => {
  installFetchMock();
  try {
    const malicious = '"><img src=x onerror=alert(1)>';
    await sendReservationCancelledEmail("victim2@example.com", {
      ...baseDetails,
      customerName: malicious,
      wasConfirmed: false,
    });

    assert.ok(lastRequestBody, "deveria ter chamado fetch com o corpo da requisição");
    const html = lastRequestBody!.html ?? "";
    assert.ok(!html.includes("<img src=x onerror=alert(1)>"), "tag <img> com onerror não deveria sobreviver como tag de verdade");
    assert.ok(
      html.includes("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"),
      "nome do cliente deveria aparecer escapado como texto literal"
    );
  } finally {
    restoreFetch();
  }
});

test("sendReservationCancelledEmail (reserva já confirmada) também escapa o nome do cliente", async () => {
  installFetchMock();
  try {
    const malicious = "Fulano<svg onload=alert(1)>";
    await sendReservationCancelledEmail("victim3@example.com", {
      ...baseDetails,
      customerName: malicious,
      wasConfirmed: true,
    });

    assert.ok(lastRequestBody, "deveria ter chamado fetch com o corpo da requisição");
    const html = lastRequestBody!.html ?? "";
    assert.ok(!html.includes("<svg onload=alert(1)>"), "tag <svg> com onload não deveria sobreviver como tag de verdade");
    assert.ok(html.includes("Fulano&lt;svg onload=alert(1)&gt;"), "nome do cliente deveria aparecer escapado como texto literal");
  } finally {
    restoreFetch();
  }
});
