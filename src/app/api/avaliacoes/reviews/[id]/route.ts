import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { decryptSecret } from "@/lib/vault";
import { getIfoodAccessToken, postIfoodReviewAnswer } from "@/lib/ifood-client";
import { IFOOD_REPLY_MAX_LENGTH, IFOOD_REPLY_MIN_LENGTH } from "@/lib/review-ai";

/**
 * Fallback manual para uma avaliação que o fluxo automático não resolveu sozinha — o usuário
 * digita/ajusta o texto (normalmente a partir de `generatedReply`, já exibido pela tela) e
 * confirma publicar. Só aceita avaliações em `PRECISA_REVISAO_MANUAL` ou `ERRO` (ver prompt da
 * tarefa "avaliacoes-ifood-fase1"): uma avaliação já `RESPONDIDA`/`AUTO_PUBLICADA_SEM_RESPOSTA`/
 * `EXPIRADA`/`PENDENTE` não tem nenhuma ação manual pendente aqui.
 *
 * Mesmo padrão de acesso a um registro existente por id de
 * `src/app/api/satisfacao-cliente/avaliacoes/[id]/route.ts`: `assertEmpresaAccess` contra a
 * `empresaId` do próprio registro, não a loja "ativa" da sessão — editar uma avaliação
 * específica só depende do usuário ter acesso à loja DELA.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "avaliacoes", "canEdit"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite responder avaliações manualmente." }, { status: 403 });
  }

  const { id } = await params;
  const review = await prisma.review.findUnique({
    where: { id },
    include: { empresa: { select: { id: true, ifoodClientId: true, ifoodClientSecretCipher: true, ifoodMerchantId: true } } },
  });
  if (!review) return NextResponse.json({ error: "Avaliação não encontrada." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, review.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }

  if (review.status !== "PRECISA_REVISAO_MANUAL" && review.status !== "ERRO") {
    // Cobre também `SIMULADA` (resultado do botão "Simular" — nunca tem ação de publicar
    // específica, ver src/lib/review-sync.ts: simular é só prévia, ativar o automático é o
    // próximo passo) além dos casos já encerrados (RESPONDIDA/AUTO_PUBLICADA_SEM_RESPOSTA/
    // EXPIRADA/PENDENTE).
    return NextResponse.json(
      {
        error:
          review.status === "SIMULADA"
            ? "Esta avaliação é apenas uma prévia simulada (nunca foi publicada) — não há nada para reenviar aqui. Ative a resposta automática em Avaliações > Configurações para publicar de verdade."
            : "Esta avaliação não está mais pendente de revisão manual (já foi respondida, publicada sozinha pelo iFood ou expirou). Atualize a página.",
      },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const reply = typeof body.reply === "string" ? body.reply.trim() : "";
  if (reply.length < IFOOD_REPLY_MIN_LENGTH || reply.length > IFOOD_REPLY_MAX_LENGTH) {
    return NextResponse.json(
      { error: `O texto da resposta precisa ter entre ${IFOOD_REPLY_MIN_LENGTH} e ${IFOOD_REPLY_MAX_LENGTH} caracteres (limite do iFood).` },
      { status: 400 }
    );
  }

  if (review.platform !== "IFOOD") {
    // Nunca deve acontecer na Fase 1 (nenhum Review com platform GOOGLE é criado ainda — ver
    // bloco "AVALIAÇÕES" em prisma/schema.prisma), mas evita um erro confuso caso aconteça.
    return NextResponse.json({ error: "Resposta manual só é suportada para avaliações do iFood nesta fase." }, { status: 400 });
  }

  const { ifoodClientId, ifoodClientSecretCipher, ifoodMerchantId } = review.empresa;
  if (!ifoodClientId || !ifoodClientSecretCipher || !ifoodMerchantId) {
    return NextResponse.json({ error: "As credenciais do iFood desta loja não estão mais configuradas." }, { status: 400 });
  }

  let clientSecret: string;
  try {
    clientSecret = decryptSecret(ifoodClientSecretCipher);
  } catch {
    return NextResponse.json({ error: "Não foi possível decifrar as credenciais do iFood desta loja." }, { status: 500 });
  }

  const tokenResult = await getIfoodAccessToken(ifoodClientId, clientSecret);
  if (!tokenResult.ok) {
    return NextResponse.json({ error: `Não foi possível autenticar no iFood: ${tokenResult.error}` }, { status: 502 });
  }

  const posted = await postIfoodReviewAnswer(tokenResult.accessToken, ifoodMerchantId, review.externalReviewId, reply);
  if (!posted.ok) {
    await prisma.review.update({
      where: { id: review.id },
      data: { status: posted.conflict ? "EXPIRADA" : "ERRO", errorMessage: posted.error },
    });
    return NextResponse.json({ error: posted.error }, { status: posted.conflict ? 409 : 502 });
  }

  const updated = await prisma.review.update({
    where: { id: review.id },
    data: { status: "RESPONDIDA", postedReply: reply, repliedAt: new Date(), errorMessage: null },
  });

  return NextResponse.json({
    ok: true,
    review: {
      id: updated.id,
      status: updated.status,
      postedReply: updated.postedReply,
      repliedAt: updated.repliedAt?.toISOString() ?? null,
    },
  });
}
