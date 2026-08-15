const GRAPH_BASE = "https://graph.facebook.com";
const PAGE_LIMIT = 500;

export type MetaAdsInsightRow = {
  date_start: string;
  date_stop: string;
  campaign_id: string;
  campaign_name: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  publisher_platform?: string;
  platform_position?: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
};

export type MetaAdsClientResult =
  | { ok: true; rows: MetaAdsInsightRow[] }
  | { ok: false; error: string };

/**
 * Busca insights de campanhas na Graph API da Meta, paginando via `paging.next`.
 * Espelha a consulta usada pelo script local `meta-ads.mjs` (nível campanha,
 * breakdown por publisher_platform/platform_position).
 */
export async function fetchMetaAdsInsights(
  token: string,
  adAccountId: string,
  graphVersion: string,
  range: { start: Date; end: Date }
): Promise<MetaAdsClientResult> {
  const accountId = adAccountId.replace(/^act_/, "");
  const graphBase = `${GRAPH_BASE}/${graphVersion}`;

  const url = new URL(`${graphBase}/act_${accountId}/insights`);
  url.searchParams.set(
    "fields",
    "date_start,date_stop,campaign_id,campaign_name,spend,impressions,reach,clicks,actions,action_values"
  );
  url.searchParams.set(
    "time_range",
    JSON.stringify({ since: formatDate(range.start), until: formatDate(range.end) })
  );
  url.searchParams.set("level", "campaign");
  url.searchParams.set("breakdowns", "publisher_platform,platform_position");
  url.searchParams.set("limit", String(PAGE_LIMIT));
  url.searchParams.set("access_token", token);

  const rows: MetaAdsInsightRow[] = [];
  let nextUrl: string | null = url.toString();

  while (nextUrl) {
    let response: Response;
    try {
      response = await fetch(nextUrl, { headers: { Accept: "application/json" } });
    } catch {
      return { ok: false, error: "Falha de conexão com a Graph API da Meta." };
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.error) {
      const message = payload?.error?.message || `Erro HTTP ${response.status} na Graph API da Meta.`;
      return { ok: false, error: message };
    }

    rows.push(...((payload.data ?? []) as MetaAdsInsightRow[]));
    nextUrl = payload.paging?.next ?? null;
  }

  return { ok: true, rows };
}

/** Valida o token e a conta configurada, retornando nome/moeda da conta. */
export async function fetchMetaAdAccount(
  token: string,
  adAccountId: string,
  graphVersion: string
): Promise<{ ok: true; name: string; currency: string } | { ok: false; error: string }> {
  const accountId = adAccountId.replace(/^act_/, "");
  const url = new URL(`${GRAPH_BASE}/${graphVersion}/act_${accountId}`);
  url.searchParams.set("fields", "id,name,account_status,currency,timezone_name");
  url.searchParams.set("access_token", token);

  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" } });
  } catch {
    return { ok: false, error: "Falha de conexão com a Graph API da Meta." };
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.error) {
    const message = payload?.error?.message || `Erro HTTP ${response.status} na Graph API da Meta.`;
    return { ok: false, error: message };
  }

  return { ok: true, name: payload.name ?? "", currency: payload.currency ?? "BRL" };
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
