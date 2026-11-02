import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/vault";
import { getIfoodAccessToken, fetchIfoodReviews, postIfoodReviewAnswer, type IfoodReviewRecord } from "@/lib/ifood-client";
import { toReviewBaseData, mapIfoodReviewLifecycleStatus, extractIfoodMerchantReplyText } from "@/lib/ifood-mapper";
import { generateReviewReply } from "@/lib/review-ai";
import { containsRiskKeyword } from "@/lib/review-risk";
import type { Empresa, Prisma, ReviewStatus } from "@prisma/client";

export type ReviewSyncOutcome =
  | {
      ok: true;
      processed: number;
      respondidas: number;
      precisaRevisaoManual: number;
      autoPublicadas: number;
      expiradas: number;
      erros: number;
      simuladas: number;
    }
  | { ok: false; error: string };

/**
 * `"real"` (padrão): fluxo normal — gera a resposta, checa a palavra-chave de risco e PUBLICA
 * no iFood quando seguro. `"simulate"`: gera a resposta e checa a palavra-chave de risco
 * EXATAMENTE igual, mas NUNCA chama `postIfoodReviewAnswer` — a avaliação sempre termina em
 * `SIMULADA` (ou `PRECISA_REVISAO_MANUAL`/`ERRO`, se for o caso; ver `processNotRepliedReview`).
 * Existe para o usuário poder ver como as respostas da IA ficariam ANTES de ligar
 * `Empresa.avaliacoesAutoReplyEnabled` de vez para uma loja — funciona mesmo com o toggle
 * desligado (decisão do Matheus: sem isso, a única forma de "ver como as respostas ficam" seria
 * ligar o toggle de verdade, que já publica).
 */
export type ReviewSyncMode = "real" | "simulate";

type ReviewBaseData = ReturnType<typeof toReviewBaseData>;

type ReviewUpsertFields = {
  status: ReviewStatus;
  generatedReply: string | null;
  postedReply: string | null;
  repliedAt: Date | null;
  errorMessage: string | null;
};

function errorMessageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Erro inesperado ao sincronizar avaliações do iFood.";
}

/**
 * Decide o destino de UMA avaliação já com status `NOT_REPLIED` na API do iFood — gera a
 * resposta via IA, aplica a checagem de palavra-chave de risco (2ª rede de segurança, ver
 * `src/lib/review-risk.ts`) e, se estiver tudo certo E `mode === "real"`, publica. Função
 * separada da orquestração principal (`syncEmpresaReviews` abaixo) só para facilitar
 * leitura/teste — chamada sempre com o toggle `avaliacoesAutoReplyEnabled` já confirmado `true`
 * por quem chama QUANDO `mode === "real"` (ver comentário em `syncEmpresaReviews`); no modo
 * `"simulate"` o toggle não importa — esta função nunca verifica o toggle sozinha, de qualquer
 * forma.
 */
async function processNotRepliedReview(params: {
  mode: ReviewSyncMode;
  accessToken: string;
  merchantId: string;
  empresaName: string;
  base: ReviewBaseData;
}): Promise<ReviewUpsertFields> {
  const { mode, accessToken, merchantId, empresaName, base } = params;

  const generated = await generateReviewReply({
    empresaName,
    rating: base.rating,
    comment: base.comment,
    customerName: base.customerName,
  });

  if (!generated.ok) {
    // NOT_CONFIGURED/ERROR/INVALID_LENGTH: nenhum desses casos é seguro de publicar sem
    // revisão — e também não há nada pra "simular" (a IA não gerou texto nenhum). Vira ERRO
    // (não PRECISA_REVISAO_MANUAL) porque não é uma decisão de risco de CONTEÚDO — é uma falha
    // técnica. No modo real, é reprocessada automaticamente na próxima sincronização enquanto a
    // avaliação continuar `NOT_REPLIED` no iFood (dentro do prazo de 5 dias); no modo simulação,
    // é só um jeito de o usuário descobrir, sem publicar nada, que a geração está com problema
    // (ex. chave de IA não configurada).
    return { status: "ERRO", generatedReply: null, postedReply: null, repliedAt: null, errorMessage: generated.message };
  }

  if (containsRiskKeyword(base.comment)) {
    // 2ª rede de segurança — nunca publica sozinha, mesmo com o toggle da loja ligado (ver
    // comentário completo em `src/lib/review-risk.ts`) e mesmo em modo real. No modo simulação,
    // isso já é uma informação útil por si só: mostra que o fluxo automático TAMBÉM reteria
    // esta avaliação para revisão manual, em vez de publicar sozinho. O texto gerado fica salvo
    // como ponto de partida para quem revisar manualmente (`PATCH /api/avaliacoes/reviews/[id]`)
    // nos dois modos.
    return {
      status: "PRECISA_REVISAO_MANUAL",
      generatedReply: generated.reply,
      postedReply: null,
      repliedAt: null,
      errorMessage: null,
    };
  }

  if (mode === "simulate") {
    // Nunca chama `postIfoodReviewAnswer` neste modo — é o ÚNICO propósito de existir: deixar o
    // usuário ver o texto que a IA geraria (e que o fluxo real publicaria sozinho) sem publicar
    // nada de verdade. `SIMULADA` deixa isso explícito no status gravado (ver enum
    // `ReviewStatus` em prisma/schema.prisma) — a tela também reforça isso visualmente.
    return { status: "SIMULADA", generatedReply: generated.reply, postedReply: null, repliedAt: null, errorMessage: null };
  }

  const posted = await postIfoodReviewAnswer(accessToken, merchantId, base.externalReviewId, generated.reply);
  if (posted.ok) {
    return {
      status: "RESPONDIDA",
      generatedReply: generated.reply,
      postedReply: generated.reply,
      repliedAt: new Date(),
      errorMessage: null,
    };
  }

  if (posted.conflict) {
    // A avaliação deixou de estar `NOT_REPLIED` entre a listagem e esta chamada (respondida por
    // outro canal — ex. alguém pelo app do iFood —, publicada sozinha, ou passou do prazo de 5
    // dias). A próxima sincronização corrige o status real a partir do que o iFood devolver.
    return {
      status: "EXPIRADA",
      generatedReply: generated.reply,
      postedReply: null,
      repliedAt: null,
      errorMessage: posted.error,
    };
  }

  return { status: "ERRO", generatedReply: generated.reply, postedReply: null, repliedAt: null, errorMessage: posted.error };
}

/**
 * Decide o destino de uma avaliação que a API do iFood já marca como `REPLIED`/`PUBLISHED`
 * (ciclo encerrado — nenhuma ação nossa é mais possível, só registrar para histórico/auditoria).
 */
function resolveClosedReviewFields(record: IfoodReviewRecord, base: ReviewBaseData): ReviewUpsertFields {
  const merchantReply = extractIfoodMerchantReplyText(record);
  if (merchantReply) {
    return {
      status: "RESPONDIDA",
      // `generatedReply` fica nulo aqui de propósito: esta resposta não foi necessariamente
      // gerada por este módulo (pode ter sido respondida direto no app do iFood, por uma pessoa,
      // ou em uma sincronização anterior a este deploy) — só `postedReply` é confiável.
      generatedReply: null,
      postedReply: merchantReply.text,
      repliedAt: merchantReply.createdAt,
      errorMessage: null,
    };
  }

  // Sem nenhuma resposta do parceiro: nota 5 OU avaliação sem comentário, publicada sozinha
  // pelo iFood, é o caso esperado (regra documentada — nunca passa por `NOT_REPLIED` nesse
  // caso). Qualquer outra combinação chegando aqui já publicada e sem resposta significa que o
  // prazo de 5 dias passou sem este módulo (ou ninguém) conseguir responder a tempo.
  const autoPublicavelSemResposta = base.rating === 5 || !base.comment;
  return {
    status: autoPublicavelSemResposta ? "AUTO_PUBLICADA_SEM_RESPOSTA" : "EXPIRADA",
    generatedReply: null,
    postedReply: null,
    repliedAt: null,
    errorMessage: null,
  };
}

// >= prazo de 5 dias que o iFood dá para responder, com folga — garante que uma avaliação que
// ficou presa em ERRO (ex. IA fora do ar por um dia) continue sendo buscada e reprocessada nas
// sincronizações seguintes, enquanto ainda houver chance real de responder a tempo.
const REVIEW_SYNC_WINDOW_DAYS = 7;

export function defaultReviewSyncRange(): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date(end.getTime() - REVIEW_SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Sincroniza as avaliações do iFood de UMA empresa: busca avaliações no período, decide o
 * destino de cada uma (gera resposta via IA + checa palavra-chave de risco + publica quando
 * seguro E `mode === "real"`) e grava o resultado em `Review` (upsert por
 * empresa+plataforma+id externo — seguro reexecutar sobre o mesmo período, nos dois modos).
 *
 * `mode` (padrão `"real"`, ver `ReviewSyncMode` acima): no modo `"real"`, quem CHAMA esta
 * função já deve ter confirmado `empresa.avaliacoesAutoReplyEnabled === true` antes de chamar
 * (ver prompt da tarefa "avaliacoes-ifood-fase1": a geração/publicação automática só roda "para
 * cada empresa com credenciais válidas E avaliacoesAutoReplyEnabled=true") — ver
 * `src/app/api/integracoes/avaliacoes/ifood-sync/route.ts`, que filtra isso antes de chamar
 * esta função. Esta função não recebe nem verifica o toggle sozinha, de propósito: evita duas
 * fontes de verdade sobre a mesma regra. No modo `"simulate"` o toggle é irrelevante — a função
 * busca as avaliações normalmente (só leitura, nunca afeta o iFood) e gera as respostas via IA,
 * mas nunca publica (ver `processNotRepliedReview`).
 *
 * Processa UMA avaliação por vez (sem `Promise.all`) de propósito: nem a API do iFood nem a da
 * Anthropic devem receber uma rajada de chamadas simultâneas por loja (CLAUDE.md: "seja
 * conservador, sem rajada de requisições"). O volume esperado de avaliações novas por loja por
 * dia é pequeno (tipicamente poucas unidades), então isso não é um problema de performance real.
 */
export async function syncEmpresaReviews(
  empresa: Pick<Empresa, "id" | "name" | "ifoodClientId" | "ifoodClientSecretCipher" | "ifoodMerchantId">,
  range: { start: Date; end: Date } = defaultReviewSyncRange(),
  mode: ReviewSyncMode = "real"
): Promise<ReviewSyncOutcome> {
  const { ifoodClientId: clientId, ifoodClientSecretCipher: clientSecretCipher, ifoodMerchantId: merchantId } = empresa;
  if (!clientId || !clientSecretCipher || !merchantId) {
    return { ok: false, error: "Credenciais do iFood não configuradas para esta loja." };
  }

  try {
    let clientSecret: string;
    try {
      clientSecret = decryptSecret(clientSecretCipher);
    } catch (err) {
      return {
        ok: false,
        error: `Não foi possível decifrar o clientSecret salvo — tente cadastrar a credencial novamente em Configurações. (Detalhe técnico: ${errorMessageOf(err)})`,
      };
    }
    if (!clientSecret) {
      return {
        ok: false,
        error: "O clientSecret salvo está em um formato inválido ou corrompido — tente cadastrar a credencial novamente em Configurações.",
      };
    }

    const tokenResult = await getIfoodAccessToken(clientId, clientSecret);
    if (!tokenResult.ok) return { ok: false, error: tokenResult.error };

    const reviewsResult = await fetchIfoodReviews(tokenResult.accessToken, merchantId, range);
    if (!reviewsResult.ok) return { ok: false, error: reviewsResult.error };

    let processed = 0;
    let respondidas = 0;
    let precisaRevisaoManual = 0;
    let autoPublicadas = 0;
    let expiradas = 0;
    let erros = 0;
    let simuladas = 0;

    for (const record of reviewsResult.reviews) {
      const lifecycle = mapIfoodReviewLifecycleStatus(record);
      // DISCARDED (removida da contagem de score, sem ação possível do parceiro), CREATED
      // (ainda em validação — cedo demais pra agir) e UNKNOWN (não foi possível determinar o
      // estado) não são gravadas nesta fase: não há nenhuma decisão de negócio segura a tomar
      // sobre elas ainda. Uma sincronização futura, dentro da janela de
      // `REVIEW_SYNC_WINDOW_DAYS`, pega o estado seguinte quando ele existir.
      if (lifecycle === "DISCARDED" || lifecycle === "CREATED" || lifecycle === "UNKNOWN") continue;

      let base: ReviewBaseData;
      try {
        base = toReviewBaseData(empresa.id, record);
      } catch (err) {
        // Avaliação sem id/data/nota válidos — não é possível identificá-la de forma segura
        // para um upsert; loga e segue para a próxima (nunca derruba o lote inteiro por um
        // registro malformado).
        console.error(`[review-sync] avaliação do iFood ignorada por dado inválido (empresa ${empresa.id}):`, errorMessageOf(err));
        continue;
      }

      const fields: ReviewUpsertFields =
        lifecycle === "NOT_REPLIED"
          ? await processNotRepliedReview({
              mode,
              accessToken: tokenResult.accessToken,
              merchantId,
              empresaName: empresa.name,
              base,
            })
          : resolveClosedReviewFields(record, base);

      await prisma.review.upsert({
        where: {
          empresaId_platform_externalReviewId: {
            empresaId: empresa.id,
            platform: "IFOOD",
            externalReviewId: base.externalReviewId,
          },
        },
        update: {
          rating: base.rating,
          comment: base.comment,
          customerName: base.customerName,
          reviewDate: base.reviewDate,
          raw: base.raw as Prisma.InputJsonValue,
          ...fields,
        },
        create: { ...base, raw: base.raw as Prisma.InputJsonValue, ...fields },
      });

      processed++;
      if (fields.status === "RESPONDIDA") respondidas++;
      else if (fields.status === "PRECISA_REVISAO_MANUAL") precisaRevisaoManual++;
      else if (fields.status === "AUTO_PUBLICADA_SEM_RESPOSTA") autoPublicadas++;
      else if (fields.status === "EXPIRADA") expiradas++;
      else if (fields.status === "ERRO") erros++;
      else if (fields.status === "SIMULADA") simuladas++;
    }

    return { ok: true, processed, respondidas, precisaRevisaoManual, autoPublicadas, expiradas, erros, simuladas };
  } catch (err) {
    return { ok: false, error: errorMessageOf(err) };
  }
}
