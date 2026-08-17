// Integração via Open Delivery (padrão aberto Abrasel) que a Cardápio Web
// expõe em Configurações → Integrações → API Open Delivery. A documentação
// oficial não é acessível a partir deste ambiente, então o diagnóstico abaixo
// tenta os caminhos mais comuns do padrão Open Delivery para descobrir, na
// prática, qual funciona para esta conta — ver /api/integracoes/cardapio-web/test.

const BASE_URL = "https://integracao.cardapioweb.com/api/open_delivery";

const TOKEN_PATH_CANDIDATES = [
  "/v1/oauth/token",
  "/oauth/token",
  "/v1.5/authentication/v1.0/token",
  "/authentication/v1.0/token",
];

const EVENTS_PATH_CANDIDATES = ["/v1/orders/events:polling", "/order/v1.5/events:polling", "/v1.5/events:polling", "/events:polling"];

export type DiagnosticAttempt = { url: string; status: number | null; ok: boolean; bodySnippet: string; error?: string };

export type CardapioWebDiagnosticResult = {
  tokenAttempts: DiagnosticAttempt[];
  accessToken: string | null;
  eventsAttempts: DiagnosticAttempt[];
};

async function tryFetch(url: string, init: RequestInit): Promise<DiagnosticAttempt> {
  try {
    const res = await fetch(url, init);
    const text = await res.text().catch(() => "");
    return { url, status: res.status, ok: res.ok, bodySnippet: text.slice(0, 500) };
  } catch (cause) {
    return { url, status: null, ok: false, bodySnippet: "", error: cause instanceof Error ? cause.message : "Falha de conexão." };
  }
}

/**
 * Testa credenciais Open Delivery contra os caminhos mais comuns do padrão,
 * já que não temos acesso à documentação exata desta conta a partir daqui.
 * Retorna todas as tentativas (URL, status, corpo) para diagnóstico manual.
 */
export async function diagnoseCardapioWebConnection(establishmentId: string, secret: string): Promise<CardapioWebDiagnosticResult> {
  const tokenAttempts: DiagnosticAttempt[] = [];
  let accessToken: string | null = null;

  for (const path of TOKEN_PATH_CANDIDATES) {
    const attempt = await tryFetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: establishmentId,
        client_secret: secret,
      }).toString(),
    });
    tokenAttempts.push(attempt);

    if (attempt.ok) {
      try {
        const parsed = JSON.parse(attempt.bodySnippet) as { access_token?: string };
        if (parsed.access_token) {
          accessToken = parsed.access_token;
          break;
        }
      } catch {
        // corpo não era JSON válido; segue tentando os outros caminhos.
      }
    }
  }

  const eventsAttempts: DiagnosticAttempt[] = [];
  if (accessToken) {
    for (const path of EVENTS_PATH_CANDIDATES) {
      const attempt = await tryFetch(`${BASE_URL}${path}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      eventsAttempts.push(attempt);
      if (attempt.ok) break;
    }
  }

  return { tokenAttempts, accessToken, eventsAttempts };
}
