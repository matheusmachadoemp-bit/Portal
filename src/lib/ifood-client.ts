// Cliente HTTP da API de Parceiro do iFood (merchant-api.ifood.com.br).
//
// LEIA ANTES DE MEXER: este arquivo foi escrito com base na documentação
// pública do iFood (developer.ifood.com.br) consultada via busca — o agente
// que escreveu isso não teve acesso a uma credencial real pra testar contra
// a API de verdade (a integração ainda não tinha token quando foi
// construída). Cada endpoint abaixo está marcado com o nível de confiança:
//
//   [CONFIRMADO]     — path/método/parâmetros apareceram de forma consistente
//                       em múltiplas buscas independentes na documentação
//                       oficial.
//   [MELHOR ESFORÇO]  — o formato geral (autenticação Bearer, paginação
//                       page/size, JSON) é o padrão usado em todo o resto da
//                       API do iFood, mas o path exato (principalmente a
//                       versão, ex. "v1.0" vs "v3.0") não pôde ser
//                       confirmado com certeza absoluta.
//
// Antes de usar isso contra a loja real pela primeira vez, o próximo passo é
// pegar a credencial real, rodar um teste manual (ex. um script solto
// chamando `getIfoodAccessToken` e depois `fetchIfoodSales` com um intervalo
// de 1 dia) e comparar a resposta com o que está assumido aqui — mesma
// lógica de "sempre simular contra um arquivo real antes de publicar" que já
// vale pra importação de arquivo (ver CLAUDE.md).

const IFOOD_API_BASE = "https://merchant-api.ifood.com.br";

// [CONFIRMADO] POST /authentication/v1.0/oauth/token, grant_type
// "client_credentials", parâmetros em camelCase (grantType/clientId/
// clientSecret — o iFood foge do padrão snake_case do OAuth2 "clássico" em
// vários endpoints, não só neste). Token expira por padrão em 6h
// (21600s) — por isso este cliente NUNCA persiste o accessToken: pede um
// novo a cada sincronização (mesmo padrão de simplicidade que a Saipos usa
// com um token de vida longa, só que aqui o token em si é descartável;
// quem é persistido e criptografado é o par clientId/clientSecret que o
// gera — ver `Empresa.ifoodClientId`/`ifoodClientSecretCipher`).
const IFOOD_AUTH_URL = `${IFOOD_API_BASE}/authentication/v1.0/oauth/token`;

// [CONFIRMADO] GET /merchant/v1.0/merchants — lista as lojas (merchants)
// vinculadas às credenciais informadas. Usado só na tela de configuração,
// pra validar o clientId/clientSecret e ajudar a preencher o merchantId
// certo sem o usuário ter que ir copiar um UUID de outro lugar.
const IFOOD_MERCHANTS_URL = `${IFOOD_API_BASE}/merchant/v1.0/merchants`;

// [MELHOR ESFORÇO] GET /financial/{version}/{merchantId}/sales — API de
// Vendas do módulo Financial: "exibe todas as vendas ocorridas em um
// determinado período" (paginada, parâmetros beginSalesDate/endSalesDate/
// page/size), com forma de pagamento, valor bruto (saleGrossValue),
// descontos/benefícios e status de cada venda — é o equivalente funcional
// do `search_sales` da Saipos. O que não foi possível confirmar com certeza
// é a versão do módulo Financial atualmente em produção (a documentação
// menciona pelo menos v2 e v3, com v2.0/v2.1 descontinuadas a partir de
// 17/06/2025 — então v3 é a aposta mais segura, mas PRECISA ser confirmada
// no primeiro teste real). Se o path abaixo devolver 404, o primeiro
// lugar a olhar é a versão neste template.
const IFOOD_FINANCIAL_SALES_VERSION = "v3.0";
function ifoodSalesUrl(merchantId: string): string {
  return `${IFOOD_API_BASE}/financial/${IFOOD_FINANCIAL_SALES_VERSION}/${encodeURIComponent(merchantId)}/sales`;
}

const PAGE_SIZE = 100;
// 429 (rate limit) documentado explicitamente pelo iFood — diferente da
// Saipos (só 502/503/504), o iFood pode devolver 429 mesmo numa chamada
// "correta" se o app estourar o limite de requisições do endpoint. Entra na
// mesma lista de retry porque, assim como um 502/503/504, não é um erro de
// dado — é só "tente de novo daqui a pouco".
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = [2000, 5000, 10000];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<{ ok: true; res: Response } | { ok: false; error: string }> {
  let res: Response | null = null;
  let lastError = "";
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      res = await fetch(url, init);
    } catch {
      lastError = "Falha de conexão com a API do iFood.";
      res = null;
    }

    if (res && !RETRYABLE_STATUS.has(res.status)) break;
    if (res) lastError = `Erro ${res.status} na API do iFood (instabilidade ou limite de requisições temporário).`;
    if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS[attempt]);
  }

  if (!res) return { ok: false, error: lastError || "Falha de conexão com a API do iFood." };
  return { ok: true, res };
}

export type IfoodTokenResult =
  | { ok: true; accessToken: string; expiresInSeconds: number }
  | { ok: false; error: string };

/**
 * Troca clientId/clientSecret por um accessToken de curta duração (fluxo
 * OAuth2 client_credentials). Chamado a cada sincronização — nunca reaproveita
 * um token salvo (ver comentário no topo do arquivo).
 */
export async function getIfoodAccessToken(clientId: string, clientSecret: string): Promise<IfoodTokenResult> {
  const body = new URLSearchParams({
    grantType: "client_credentials",
    clientId,
    clientSecret,
  });

  const attempt = await fetchWithRetry(IFOOD_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
  });
  if (!attempt.ok) return { ok: false, error: attempt.error };

  const res = attempt.res;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 400) {
      return { ok: false, error: "clientId ou clientSecret do iFood inválidos (ou expirados)." };
    }
    return { ok: false, error: `Erro ${res.status} ao autenticar na API do iFood. ${text}`.trim() };
  }

  const data = await res.json().catch(() => null);
  // Tolerante a camelCase (documentado: accessToken/expiresIn) ou o
  // snake_case padrão de OAuth2 (access_token/expires_in), caso a resposta
  // real divirja do que a documentação descreve.
  const accessToken: unknown = data?.accessToken ?? data?.access_token;
  const expiresInSeconds: unknown = data?.expiresIn ?? data?.expires_in ?? 21600;

  if (typeof accessToken !== "string" || !accessToken) {
    return { ok: false, error: "A API do iFood não devolveu um accessToken válido na resposta de autenticação." };
  }

  return { ok: true, accessToken, expiresInSeconds: Number(expiresInSeconds) || 21600 };
}

export type IfoodMerchant = { id: string; name: string; corporateName?: string };
export type IfoodMerchantsResult = { ok: true; merchants: IfoodMerchant[] } | { ok: false; error: string };

/** Lista as lojas (merchants) vinculadas ao token — usado para validar/preencher o merchantId nas Configurações. */
export async function fetchIfoodMerchants(accessToken: string): Promise<IfoodMerchantsResult> {
  const merchants: IfoodMerchant[] = [];
  let page = 1;

  while (true) {
    const url = new URL(IFOOD_MERCHANTS_URL);
    url.searchParams.set("page", String(page));
    url.searchParams.set("size", String(PAGE_SIZE));

    const attempt = await fetchWithRetry(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!attempt.ok) return { ok: false, error: attempt.error };

    const res = attempt.res;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Erro ${res.status} ao listar lojas do iFood. ${text}`.trim() };
    }

    const data = await res.json().catch(() => null);
    const items: unknown[] = Array.isArray(data) ? data : (data?.data ?? data?.merchants ?? []);
    for (const item of items) {
      const m = item as Record<string, unknown>;
      if (typeof m.id === "string") {
        merchants.push({
          id: m.id,
          name: typeof m.name === "string" ? m.name : "",
          corporateName: typeof m.corporateName === "string" ? m.corporateName : undefined,
        });
      }
    }

    if (items.length < PAGE_SIZE) break;
    page += 1;
  }

  return { ok: true, merchants };
}

/**
 * Formato de data aceito pelos parâmetros beginSalesDate/endSalesDate — como
 * a própria documentação diz que "as vendas ficam disponíveis na API no
 * mesmo dia em que ocorrem", a granularidade é de dia (sem hora), então
 * usamos só a parte "YYYY-MM-DD" do ISO. A CONFIRMAR no primeiro teste real
 * se a API espera esse formato ou um timestamp completo.
 */
function formatIfoodDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type IfoodSaleRecord = {
  id?: string;
  orderId?: string;
  saleId?: string;
  currentStatus?: string;
  salesDate?: string;
  orderDate?: string;
  createdAt?: string;
  orderType?: string;
  salesChannel?: string;
  channel?: string;
  saleGrossValue?: number;
  payments?: { method?: string; type?: string; prepaid?: boolean; value?: number }[];
  paymentMethod?: { method?: string; type?: string; prepaid?: boolean; value?: number };
  [key: string]: unknown;
};

export type IfoodSalesResult = { ok: true; sales: IfoodSaleRecord[] } | { ok: false; error: string };

/**
 * Busca vendas de uma loja (merchant) no período informado, paginando
 * automaticamente. [MELHOR ESFORÇO] — ver comentário sobre
 * `IFOOD_FINANCIAL_SALES_VERSION` no topo do arquivo.
 */
export async function fetchIfoodSales(
  accessToken: string,
  merchantId: string,
  range: { start: Date; end: Date }
): Promise<IfoodSalesResult> {
  const allSales: IfoodSaleRecord[] = [];
  let page = 1;

  while (true) {
    const url = new URL(ifoodSalesUrl(merchantId));
    url.searchParams.set("beginSalesDate", formatIfoodDate(range.start));
    url.searchParams.set("endSalesDate", formatIfoodDate(range.end));
    url.searchParams.set("page", String(page));
    url.searchParams.set("size", String(PAGE_SIZE));

    const attempt = await fetchWithRetry(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!attempt.ok) return { ok: false, error: attempt.error };

    const res = attempt.res;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Erro ${res.status} na API de Vendas do iFood. ${text}`.trim() };
    }

    const data = await res.json().catch(() => null);
    const pageItems: IfoodSaleRecord[] = Array.isArray(data) ? data : (data?.data ?? data?.sales ?? []);
    allSales.push(...pageItems);

    if (pageItems.length < PAGE_SIZE) break;
    page += 1;
  }

  return { ok: true, sales: allSales };
}
