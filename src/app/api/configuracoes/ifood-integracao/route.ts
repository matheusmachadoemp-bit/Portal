import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { encryptSecret, decryptSecret } from "@/lib/vault";
import { getIfoodAccessToken, fetchIfoodMerchants } from "@/lib/ifood-client";
import { hasModulePermission } from "@/lib/authz";

// Rota de configuração da credencial do iFood — path "ifood-integracao" (e
// não "ifood") de propósito, pra não colidir com
// `src/app/api/configuracoes/ifood/route.ts`, que já existe e cuida de um
// campo completamente diferente (`taxaIfoodPadrao`, usado na Ficha Técnica
// pra calcular margem de produto vendido no iFood — nada a ver com
// sincronizar pedidos).
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMINISTRADOR" && session.user.role !== "GESTOR") {
    return NextResponse.json({ error: "Sem permissão para alterar esta configuração." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "configuracoes", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite alterar as configurações do iFood." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível configurar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();
  const clientIdInput = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const clientSecretInput = typeof body.clientSecret === "string" ? body.clientSecret.trim() : "";
  const merchantId = typeof body.merchantId === "string" ? body.merchantId.trim() : "";
  const syncEnabled = Boolean(body.syncEnabled);

  // clientId não é segredo (é só um identificador do aplicativo, como um
  // "usuário" — ver comentário em `Empresa.ifoodClientId` no
  // schema.prisma), então não precisa de descriptografia; clientSecret sim,
  // então reaproveita o já salvo (decifrado) se o campo vier em branco —
  // mesmo padrão de "reaproveita o token já salvo" de
  // `configuracoes/meta-ads/route.ts`.
  const clientId = clientIdInput || empresa.ifoodClientId || "";
  const clientSecretToUse =
    clientSecretInput || (empresa.ifoodClientSecretCipher ? decryptSecret(empresa.ifoodClientSecretCipher) : "");

  if (syncEnabled && (!clientId || !clientSecretToUse || !merchantId)) {
    return NextResponse.json(
      { error: "Informe o Client ID, o Client Secret e o ID da loja (merchantId) no iFood para ativar a sincronização." },
      { status: 400 }
    );
  }

  // Testa a credencial contra a API de verdade assim que há informação
  // suficiente pra isso (mesmo fora do momento de ativar a sincronização) —
  // mesmo espírito de `fetchMetaAdAccount`/`fetchInstagramFollowers` em
  // `configuracoes/meta-ads/route.ts`: é melhor travar aqui, com uma
  // mensagem clara, do que só descobrir um clientId/merchantId digitado
  // errado na primeira sincronização automática (de madrugada, sem
  // ninguém olhando).
  let merchantName: string | null = empresa.ifoodMerchantName;
  if (clientId && clientSecretToUse && merchantId) {
    const tokenResult = await getIfoodAccessToken(clientId, clientSecretToUse);
    if (!tokenResult.ok) {
      return NextResponse.json(
        { error: `Não foi possível validar as credenciais do iFood: ${tokenResult.error}` },
        { status: 400 }
      );
    }

    const merchantsResult = await fetchIfoodMerchants(tokenResult.accessToken);
    if (!merchantsResult.ok) {
      return NextResponse.json(
        { error: `Não foi possível validar a loja no iFood: ${merchantsResult.error}` },
        { status: 400 }
      );
    }

    const match = merchantsResult.merchants.find((m) => m.id === merchantId);
    if (!match) {
      return NextResponse.json(
        {
          error:
            "O ID de loja (merchantId) informado não foi encontrado entre as lojas vinculadas a essas credenciais do iFood. Confira o valor em Configurações > iFood no Portal do Parceiro.",
        },
        { status: 400 }
      );
    }
    merchantName = match.name || match.corporateName || null;
  }

  await prisma.empresa.update({
    where: { id: empresa.id },
    data: {
      ifoodClientId: clientId || null,
      ...(clientSecretInput ? { ifoodClientSecretCipher: encryptSecret(clientSecretInput) } : {}),
      ifoodMerchantId: merchantId || null,
      ifoodMerchantName: merchantId ? merchantName : null,
      ifoodSyncEnabled: syncEnabled,
    },
  });

  return NextResponse.json({ ok: true, merchantName });
}
