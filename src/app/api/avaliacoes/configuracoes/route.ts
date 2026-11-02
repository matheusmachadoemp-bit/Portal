import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { riskKeywordsForDisplay } from "@/lib/review-risk";

/**
 * Liga/desliga `Empresa.avaliacoesAutoReplyEnabled` (rede de segurança #1 do módulo — ver
 * comentário completo em `prisma/schema.prisma`). Também devolve a lista de palavras-chave de
 * risco (rede de segurança #2) para a tela explicar o que ela faz — texto informativo, nunca
 * usado para decidir nada do lado do cliente.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "avaliacoes", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver as configurações de Avaliações." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica (não é possível configurar no modo Grupo Nord)." }, { status: 400 });
  }

  return NextResponse.json({
    avaliacoesAutoReplyEnabled: empresa.avaliacoesAutoReplyEnabled,
    hasIfoodCredentials: !!(empresa.ifoodClientId && empresa.ifoodClientSecretCipher && empresa.ifoodMerchantId),
    riskKeywords: riskKeywordsForDisplay(),
  });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "avaliacoes", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite alterar as configurações de Avaliações." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica (não é possível configurar no modo Grupo Nord)." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const avaliacoesAutoReplyEnabled = Boolean(body.avaliacoesAutoReplyEnabled);

  // Mesma validação já aplicada a Saipos/Meta Ads/iFood (ver
  // src/app/api/configuracoes/ifood-integracao/route.ts): não deixa ligar um toggle que não tem
  // como funcionar — sem clientId/clientSecret/merchantId do iFood já configurados, não há como
  // buscar nem responder avaliação nenhuma.
  if (avaliacoesAutoReplyEnabled && !(empresa.ifoodClientId && empresa.ifoodClientSecretCipher && empresa.ifoodMerchantId)) {
    return NextResponse.json(
      {
        error:
          "Configure primeiro a credencial do iFood (Configurações > iFood: Client ID, Client Secret e ID da loja) antes de ativar a resposta automática de avaliações.",
      },
      { status: 400 }
    );
  }

  await prisma.empresa.update({ where: { id: empresa.id }, data: { avaliacoesAutoReplyEnabled } });

  return NextResponse.json({ ok: true, avaliacoesAutoReplyEnabled });
}
