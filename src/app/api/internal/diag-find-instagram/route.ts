import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/vault";

// TEMPORARY, read-only diagnostic route. Delete after use.
// Uses the already-connected Meta token to look up the Instagram Business
// Account ID linked to the Business Manager, so the user doesn't have to
// dig through Business Settings manually. Tries the Business Manager's
// instagram_accounts edge, and falls back to listing Pages + their linked
// Instagram business account.
const FIX_TOKEN = "f4a8c2e6d1b39057a9c7e1f3b5d8206c9a7e1f5e9";
const EMPRESA_ID = "cmsndjpe00000497dhfcr8mzd";
const BUSINESS_ID = "136146902266091";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== FIX_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const empresa = await prisma.empresa.findUnique({
    where: { id: EMPRESA_ID },
    select: { metaAdsAccessToken: true, metaAdsGraphVersion: true },
  });
  if (!empresa?.metaAdsAccessToken) {
    return NextResponse.json({ error: "conta não configurada" }, { status: 400 });
  }

  const accessToken = decryptSecret(empresa.metaAdsAccessToken);
  const graphBase = `https://graph.facebook.com/${empresa.metaAdsGraphVersion}`;

  async function callGraph(path: string, params: Record<string, string>) {
    const url = new URL(`${graphBase}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("access_token", accessToken);
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  }

  const [businessInstagramAccounts, ownedPages, clientPages] = await Promise.all([
    callGraph(`/${BUSINESS_ID}/instagram_accounts`, { fields: "id,username,profile_pic" }),
    callGraph(`/${BUSINESS_ID}/owned_pages`, { fields: "id,name,instagram_business_account{id,username}" }),
    callGraph(`/${BUSINESS_ID}/client_pages`, { fields: "id,name,instagram_business_account{id,username}" }),
  ]);

  return NextResponse.json({
    businessId: BUSINESS_ID,
    businessInstagramAccounts: businessInstagramAccounts.body,
    ownedPages: ownedPages.body,
    clientPages: clientPages.body,
  });
}
