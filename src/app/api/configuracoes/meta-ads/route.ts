import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { encryptSecret, decryptSecret } from "@/lib/vault";
import { fetchMetaAdAccount, fetchInstagramFollowers } from "@/lib/meta-ads-client";

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Sem permissão para alterar esta configuração." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível configurar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();
  const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
  const adAccountId = typeof body.adAccountId === "string" ? body.adAccountId.trim().replace(/^act_/, "") : "";
  const graphVersion = typeof body.graphVersion === "string" && body.graphVersion.trim() ? body.graphVersion.trim() : "v21.0";
  const instagramAccountId = typeof body.instagramAccountId === "string" ? body.instagramAccountId.trim() : "";
  const syncEnabled = Boolean(body.syncEnabled);

  const tokenToUse = accessToken || (empresa.metaAdsAccessToken ? decryptSecret(empresa.metaAdsAccessToken) : "");

  if (syncEnabled && (!tokenToUse || !adAccountId)) {
    return NextResponse.json(
      { error: "Informe o token de acesso e o ID da conta de anúncios da Meta para ativar a sincronização." },
      { status: 400 }
    );
  }

  let adAccountName: string | null = empresa.metaAdsAdAccountName;
  if (tokenToUse && adAccountId) {
    const check = await fetchMetaAdAccount(tokenToUse, adAccountId, graphVersion);
    if (!check.ok) {
      return NextResponse.json({ error: `Não foi possível validar a conta de anúncios: ${check.error}` }, { status: 400 });
    }
    adAccountName = check.name;
  }

  let instagramUsername: string | null = empresa.metaAdsInstagramUsername;
  if (tokenToUse && instagramAccountId) {
    const check = await fetchInstagramFollowers(tokenToUse, instagramAccountId, graphVersion);
    if (!check.ok) {
      return NextResponse.json(
        { error: `Não foi possível validar a conta do Instagram: ${check.error}` },
        { status: 400 }
      );
    }
    instagramUsername = check.username || null;
  }

  await prisma.empresa.update({
    where: { id: empresa.id },
    data: {
      ...(accessToken ? { metaAdsAccessToken: encryptSecret(accessToken) } : {}),
      metaAdsAdAccountId: adAccountId || null,
      metaAdsAdAccountName: adAccountName,
      metaAdsGraphVersion: graphVersion,
      metaAdsInstagramAccountId: instagramAccountId || null,
      metaAdsInstagramUsername: instagramAccountId ? instagramUsername : null,
      metaAdsSyncEnabled: syncEnabled,
    },
  });

  return NextResponse.json({ ok: true, adAccountName, instagramUsername });
}
