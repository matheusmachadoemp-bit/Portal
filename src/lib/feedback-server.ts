import { prisma } from "@/lib/prisma";
import type {
  Prisma,
  FeedbackTipo,
  FeedbackStatus,
  FeedbackPrioridade,
  FeedbackImpacto,
} from "@prisma/client";
import { createNotification } from "@/lib/notifications";
import { sanitizeFileName } from "@/lib/upload";
import { head as headBlob } from "@vercel/blob";

type TxClient = Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Protocolo sequencial (BUG-000105 / MEL-000048) — ver `FeedbackProtocolCounter`,
// prisma/schema.prisma.
// ---------------------------------------------------------------------------

const PROTOCOLO_PREFIX: Record<FeedbackTipo, string> = {
  BUG: "BUG",
  SUGESTAO: "MEL",
};

/**
 * Gera o protocolo (ex.: `BUG-000105` / `MEL-000048`) — SEMPRE chamada dentro da mesma
 * transação que cria o `FeedbackReport` (ver `POST /api/feedback`). Incrementa
 * `FeedbackProtocolCounter` atomicamente via `upsert`/`increment` (mesmo padrão já comprovado
 * de `checkRateLimit`, `src/lib/rate-limit.ts`: nunca lê-e-regrava um valor — o Prisma compila
 * isso para um `INSERT ... ON CONFLICT DO UPDATE` atômico no Postgres), então dois relatos
 * concorrentes do mesmo tipo nunca recebem o mesmo número, mesmo sob carga.
 */
export async function generateFeedbackProtocolo(tx: TxClient, tipo: FeedbackTipo): Promise<string> {
  const counter = await tx.feedbackProtocolCounter.upsert({
    where: { tipo },
    create: { tipo, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  });
  return `${PROTOCOLO_PREFIX[tipo]}-${String(counter.lastNumber).padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------
// Status/prioridade — um único enum `FeedbackStatus` pros dois tipos (ver schema.prisma),
// validado em código: nunca deixar um BUG assumir um status "de sugestão" ou vice-versa.
// ---------------------------------------------------------------------------

export const FEEDBACK_STATUS_BY_TIPO: Record<FeedbackTipo, FeedbackStatus[]> = {
  BUG: ["RECEBIDO", "EM_ANALISE", "EM_CORRECAO", "AGUARDANDO_VALIDACAO", "CORRIGIDO", "REABERTO", "NAO_REPRODUZIDO"],
  SUGESTAO: ["RECEBIDA", "EM_AVALIACAO", "APROVADA", "EM_DESENVOLVIMENTO", "IMPLEMENTADA", "RECUSADA"],
};

export const FEEDBACK_STATUS_INICIAL: Record<FeedbackTipo, FeedbackStatus> = {
  BUG: "RECEBIDO",
  SUGESTAO: "RECEBIDA",
};

/**
 * Status que encerram o relato — usado pra preencher/zerar `dataConclusao`
 * (`PATCH /api/feedback/[id]`) e pro KPI "tempo médio de resolução" do dashboard. Cobre tanto o
 * desfecho "positivo" (CORRIGIDO/IMPLEMENTADA) quanto o "sem ação" (NAO_REPRODUZIDO/RECUSADA) —
 * os dois marcam o fim do ciclo de vida do relato pra fins de métrica de tempo.
 */
export const FEEDBACK_STATUS_TERMINAL = new Set<FeedbackStatus>([
  "CORRIGIDO",
  "NAO_REPRODUZIDO",
  "IMPLEMENTADA",
  "RECUSADA",
]);

/** Status que exigem `descricaoSolucao` preenchida antes de aceitar a transição (mesmo
 * racional de `PATCH /api/manutencao/chamados/[id]` — "RESOLVIDO" exige descrição da solução). */
export const FEEDBACK_STATUS_REQUIRES_SOLUCAO = new Set<FeedbackStatus>(["CORRIGIDO", "IMPLEMENTADA"]);

export function isValidStatusForTipo(tipo: FeedbackTipo, status: string): status is FeedbackStatus {
  return (FEEDBACK_STATUS_BY_TIPO[tipo] as string[]).includes(status);
}

/** Prioridade sugerida automaticamente na criação, a partir do impacto (só BUG — SUGESTAO
 * sempre nasce MEDIA) — sempre ajustável pelo admin depois via `PATCH /api/feedback/[id]`. */
export function derivePrioridadeInicial(tipo: FeedbackTipo, impacto: FeedbackImpacto | null): FeedbackPrioridade {
  if (tipo === "SUGESTAO" || !impacto) return "MEDIA";
  const map: Record<FeedbackImpacto, FeedbackPrioridade> = {
    BAIXO: "BAIXA",
    MEDIO: "MEDIA",
    ALTO: "ALTA",
    CRITICO: "CRITICA",
  };
  return map[impacto];
}

// ---------------------------------------------------------------------------
// Notificação — reaproveita o sino existente (model Notification, GET /api/notificacoes),
// nunca um canal paralelo. "Proprietário" = Role.ADMINISTRADOR (decisão do Matheus).
// ---------------------------------------------------------------------------

/**
 * Ids de todos os usuários ativos com cargo ADMINISTRADOR — mesma equivalência já usada em
 * outras notificações do Portal (`getManutencaoDonoIds`, `src/lib/manutencao-server.ts;
 * `notifySyncFailure`, `src/lib/sync-notifications.ts`). É quem recebe a notificação
 * obrigatória de todo bug/sugestão novo e quem acessa o painel administrativo (ver checagem de
 * `role === "ADMINISTRADOR"` nas rotas admin de `/api/feedback/**`).
 */
export async function getFeedbackAdminIds(): Promise<string[]> {
  const admins = await prisma.user.findMany({ where: { role: "ADMINISTRADOR", active: true }, select: { id: true } });
  return admins.map((a) => a.id);
}

type FeedbackNotifyRef = { id: string; protocolo: string; titulo: string };

/**
 * Notifica todo ADMINISTRADOR ativo de um bug/sugestão novo. Prioridade alta (CRITICA) só para
 * BUG com impacto CRITICO (ATENCAO para impacto ALTO) — o pedido original era só "bug crítico",
 * mas estender pra ALTO também soar um pouco mais alto que o padrão pareceu razoável e documentado
 * aqui por transparência.
 */
export async function notifyFeedbackAdminsOnCreate(report: {
  id: string;
  protocolo: string;
  titulo: string;
  tipo: FeedbackTipo;
  impacto: FeedbackImpacto | null;
}): Promise<void> {
  const adminIds = await getFeedbackAdminIds();
  if (adminIds.length === 0) return;

  const priority =
    report.tipo === "BUG" && report.impacto === "CRITICO"
      ? ("CRITICA" as const)
      : report.tipo === "BUG" && report.impacto === "ALTO"
        ? ("ATENCAO" as const)
        : ("INFORMACAO" as const);
  const title = report.tipo === "BUG" ? "Novo bug reportado" : "Nova sugestão recebida";
  const body = `${report.protocolo} — ${report.titulo}`;

  await Promise.all(
    adminIds.map((userId) =>
      createNotification({
        userId,
        type: report.tipo === "BUG" ? "NOVO_BUG" : "NOVA_SUGESTAO",
        title,
        body,
        priority,
        feedbackReportId: report.id,
        // A Fase 3 (dashboard admin, Caio) ainda não existe — aponta pro portal genérico por ora;
        // ajustar aqui (e o deep-link do push) quando a rota administrativa definitiva existir.
        url: "/portal",
      })
    )
  );
}

/** Avisa quem criou o relato que o status mudou (ex.: admin move de RECEBIDO -> EM_ANALISE). */
export async function notifyFeedbackStatusChange(
  report: FeedbackNotifyRef,
  recipientUserId: string,
  fromStatus: string,
  toStatus: string
): Promise<void> {
  await createNotification({
    userId: recipientUserId,
    type: "FEEDBACK_STATUS_ALTERADO",
    title: "Atualização no seu relato",
    body: `${report.protocolo} — ${report.titulo}: ${fromStatus} → ${toStatus}`,
    feedbackReportId: report.id,
    url: "/portal",
  });
}

/** Avisa quem foi definido como responsável por um relato (mesmo padrão de
 * `notifyManutencaoUser` quando um chamado ganha responsável). */
export async function notifyFeedbackResponsavelAssigned(
  report: FeedbackNotifyRef,
  responsavelId: string
): Promise<void> {
  await createNotification({
    userId: responsavelId,
    type: "FEEDBACK_RESPONSAVEL_DEFINIDO",
    title: "Você foi designado responsável",
    body: `${report.protocolo} — ${report.titulo}`,
    feedbackReportId: report.id,
    url: "/portal",
  });
}

export async function logFeedbackHistory(
  feedbackReportId: string,
  usuarioResponsavelId: string,
  tipoAlteracao: string,
  valorAnterior: string | null,
  valorNovo: string | null,
  comentario?: string | null
): Promise<void> {
  await prisma.feedbackHistory.create({
    data: { feedbackReportId, usuarioResponsavelId, tipoAlteracao, valorAnterior, valorNovo, comentario: comentario ?? null },
  });
}

// ---------------------------------------------------------------------------
// Upload de anexo — reaproveita Vercel Blob (mesmo /api/upload genérico já usado pelo resto do
// Portal). Tipos permitidos e tamanho máximo restritos aqui são ESPECÍFICOS da Central de Bugs
// e Melhorias (mais estreitos do que o que /api/upload aceita de forma genérica).
//
// NUNCA confia no que o cliente declara (mimeType/sizeBytes no JSON) nem num simples "o
// hostname termina com .public.blob.vercel-storage.com" (`isValidBlobUrl`,
// src/lib/manutencao-server.ts — isso é verdade pra QUALQUER store de QUALQUER conta Vercel do
// mundo, não só a nossa; achado do Jonas, revisão de segurança desta tarefa). Em vez disso:
// 1. `isOwnBlobUrl` compara o hostname por IGUALDADE contra o storeId embutido no nosso próprio
//    `BLOB_READ_WRITE_TOKEN` (formato padrão do token da Vercel: `vercel_blob_rw_<storeId>_<
//    segredo>` — mesma convenção que `constructBlobUrl` do próprio SDK usa internamente pra
//    montar a URL pública) — sem precisar de uma env var nova só pra isso.
// 2. `head()` do SDK oficial confirma, direto na API da Vercel (usando nosso token), que o
//    objeto existe no NOSSO store e devolve o `contentType`/tamanho REAIS — usados pra gravar
//    no banco em vez do que o cliente informou. Uma URL de outro store (ainda que, hipótese
//    teórica, passasse pelo check de hostname) falha aqui, porque nosso token não tem acesso a
//    objetos de um store que não é o nosso.
// Isto resolve, ao mesmo tempo, os dois problemas apontados: URL de store alheio E
// mimeType/tamanho forjados pelo cliente.
// ---------------------------------------------------------------------------

export const FEEDBACK_ALLOWED_ATTACHMENT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "video/mp4"];

/**
 * Limite de tamanho por anexo, em bytes — configurável via a env var
 * `FEEDBACK_MAX_ATTACHMENT_SIZE_MB` (documentar no `.env`/Vercel se for alterado), default
 * 50MB. Cobre folgadamente um print/foto de celular e uma gravação curta de tela (poucos
 * segundos) em vídeo, sem abrir pra upload de arquivos grandes demais.
 */
export const FEEDBACK_MAX_ATTACHMENT_SIZE_BYTES = (() => {
  const mb = Number(process.env.FEEDBACK_MAX_ATTACHMENT_SIZE_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : 50) * 1024 * 1024;
})();

/** Quantos anexos um único relato pode acumular — limite simples contra abuso (ex.: alguém
 * automatizando `POST /api/feedback/[id]/anexos` em loop pra encher o armazenamento/banco). */
export const FEEDBACK_MAX_ATTACHMENTS_PER_REPORT = 10;

/** Prazo máximo pra confirmar um anexo contra o Vercel Blob (`headBlobWithTimeout` abaixo) —
 * tempo de sobra pra uma chamada que deveria ser rápida (metadado de um único objeto), sem
 * deixar a requisição inteira pendurada se o Blob estiver lento/indisponível. */
const HEAD_BLOB_TIMEOUT_MS = 8_000;

export type FeedbackAttachmentInput = { name: string; fileUrl: string; mimeType?: string; sizeBytes?: number };

/** Hostname EXATO do nosso store de Vercel Blob, derivado do `BLOB_READ_WRITE_TOKEN` já
 * configurado (nunca uma env var nova) — `null` se a env var não estiver definida ou não tiver
 * o formato esperado. Sempre em minúsculas: `new URL(...).hostname` (usado em `isOwnBlobUrl`
 * abaixo) sempre devolve o hostname já normalizado em minúsculas — IDs de recurso da Vercel
 * podem ter letra maiúscula, então sem normalizar aqui também a comparação por igualdade nunca
 * bateria, rejeitando TODO anexo legítimo (achado do Teulis, revisão desta tarefa — "falha
 * fechado", não é brecha de segurança, mas inutilizava o recurso inteiro). */
function getOwnBlobStoreHostname(): string | null {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  // Formato padrão da Vercel: vercel_blob_rw_<storeId>_<segredo>.
  const storeId = token.split("_")[3];
  return storeId ? `${storeId}.public.blob.vercel-storage.com`.toLowerCase() : null;
}

function isOwnBlobUrl(url: unknown): url is string {
  if (typeof url !== "string" || !url) return false;
  const ownHostname = getOwnBlobStoreHostname();
  if (!ownHostname) return false;
  try {
    const parsed = new URL(url);
    // `parsed.hostname` já vem em minúsculas por padrão do parser de URL do JS — `ownHostname`
    // é normalizado do mesmo jeito acima, então os dois lados desta comparação são
    // case-insensitive em relação ao storeId original.
    return parsed.protocol === "https:" && parsed.hostname === ownHostname;
  } catch {
    return false;
  }
}

/**
 * `head()` do SDK, por padrão, tenta de novo até 10x (`VERCEL_BLOB_RETRIES`) com backoff
 * exponencial SEM teto (minTimeout 1s, dobrando a cada tentativa) sempre que o erro é
 * classificado como "erro de rede" — passar `abortSignal` sozinho NÃO limita isso: o abort só
 * cancela uma tentativa EM ANDAMENTO, nunca a espera entre tentativas (o pacote `async-retry`
 * usado internamente não observa nenhum sinal de cancelamento durante o backoff). Testado ao
 * vivo nesta tarefa: uma URL/objeto inacessível pode deixar a chamada pendurada por minutos.
 * Por isso corremos a chamada de verdade contra um timeout PRÓPRIO (`Promise.race`), que SEMPRE
 * devolve em `timeoutMs`, independente do que o SDK continuar tentando em segundo plano — o
 * `abortSignal` continua passado como melhor esforço pra interromper a tentativa em andamento
 * assim que o timeout vence, mas a garantia de latência vem do `Promise.race`, não dele.
 */
async function headBlobWithTimeout(url: string, timeoutMs: number): Promise<{ contentType: string; size: number }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Timeout ao confirmar anexo no Vercel Blob."));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([headBlob(url, { abortSignal: controller.signal }), timeout]);
    return { contentType: result.contentType, size: result.size };
  } finally {
    // Limpa o timer quando `headBlob()` vence a corrida antes do timeout — sem isso o timer
    // fica agendado até disparar sozinho (sem efeito real, já que ninguém mais lê `timeout`
    // depois do race resolvido, mas é higiene barata não deixar um setTimeout pendurado).
    clearTimeout(timer!);
  }
}

/** Resultado de validar e confirmar um anexo — `ok: true` já traz o `contentType`/`size` REAIS
 * (confirmados via `head()` contra o Blob), nunca os valores que o cliente declarou. */
export type ResolvedFeedbackAttachmentData = { fileUrl: string; mimeType: string; fileName: string; sizeBytes: number; uploadedById: string };
export type ResolvedFeedbackAttachment = { ok: true; data: ResolvedFeedbackAttachmentData } | { ok: false; error: string };

/**
 * Valida um anexo recebido do cliente E confirma o objeto de verdade no Vercel Blob antes de
 * aceitar — nunca confia em `mimeType`/`sizeBytes` do JSON, nem só no formato da URL. Devolve
 * já o `data` pronto pra `prisma.feedbackAttachment.create`/`createMany` (basta acrescentar
 * `feedbackReportId`; nome sanitizado com `sanitizeFileName`, `src/lib/upload.ts`) ou o erro a
 * devolver pro cliente.
 *
 * De propósito SEM `feedbackReportId` no parâmetro/retorno: esta função faz uma chamada de rede
 * (`head()`) e por isso é sempre resolvida ANTES de abrir a transação do Prisma que cria o
 * `FeedbackReport` (`POST /api/feedback`) — nunca dentro de uma transação de banco, que não
 * deveria ficar presa esperando uma chamada de rede externa.
 */
export async function resolveFeedbackAttachment(a: FeedbackAttachmentInput, uploadedById: string): Promise<ResolvedFeedbackAttachment> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return { ok: false, error: "Armazenamento de arquivos não configurado (BLOB_READ_WRITE_TOKEN ausente)." };
  }
  if (!isOwnBlobUrl(a.fileUrl)) {
    return { ok: false, error: "Anexo inválido (arquivo não hospedado no armazenamento do Portal)." };
  }

  let real: { contentType: string; size: number };
  try {
    real = await headBlobWithTimeout(a.fileUrl, HEAD_BLOB_TIMEOUT_MS);
  } catch {
    return { ok: false, error: "Não foi possível confirmar o anexo no armazenamento — tente enviar novamente." };
  }

  if (!FEEDBACK_ALLOWED_ATTACHMENT_MIME_TYPES.includes(real.contentType)) {
    return { ok: false, error: "Tipo de arquivo não permitido (só JPG, PNG, WEBP ou MP4)." };
  }
  if (real.size > FEEDBACK_MAX_ATTACHMENT_SIZE_BYTES) {
    return {
      ok: false,
      error: `Arquivo maior que o limite permitido (${Math.round(FEEDBACK_MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024))}MB).`,
    };
  }

  return {
    ok: true,
    data: {
      fileUrl: a.fileUrl,
      mimeType: real.contentType,
      fileName: sanitizeFileName(a.name),
      sizeBytes: real.size,
      uploadedById,
    },
  };
}

// ---------------------------------------------------------------------------
// Metadados técnicos — capturados automaticamente (nunca pedidos ao usuário), sempre
// sanitizados: NUNCA grava senha/token/cookie/Authorization, só os campos abaixo.
// ---------------------------------------------------------------------------

export type FeedbackMetadata = {
  rotaOrigem: string | null;
  navegador: string | null;
  sistemaOperacional: string | null;
  tipoDispositivo: string | null;
  versaoPortal: string | null;
};

/**
 * Parser simples e deliberadamente minimalista de User-Agent — só o suficiente pra ajudar o
 * admin a diagnosticar (ex.: "só acontece no Safari do iPhone"), não uma biblioteca de detecção
 * completa. Resolvido por regex em vez de adicionar uma dependência nova (ex.: ua-parser-js) só
 * pra um metadado de diagnóstico, não uma regra de negócio.
 */
function parseUserAgent(ua: string | null): {
  navegador: string | null;
  sistemaOperacional: string | null;
  tipoDispositivo: string | null;
} {
  if (!ua) return { navegador: null, sistemaOperacional: null, tipoDispositivo: null };

  let sistemaOperacional: string | null = null;
  if (/windows/i.test(ua)) sistemaOperacional = "Windows";
  else if (/android/i.test(ua)) sistemaOperacional = "Android";
  else if (/iphone|ipad|ipod/i.test(ua)) sistemaOperacional = "iOS";
  else if (/mac os x/i.test(ua)) sistemaOperacional = "macOS";
  else if (/linux/i.test(ua)) sistemaOperacional = "Linux";

  let navegador: string | null = null;
  if (/edg\//i.test(ua)) navegador = "Edge";
  else if (/opr\//i.test(ua) || /opera/i.test(ua)) navegador = "Opera";
  else if (/crios\//i.test(ua)) navegador = "Chrome (iOS)";
  else if (/fxios\//i.test(ua)) navegador = "Firefox (iOS)";
  else if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) navegador = "Chrome";
  else if (/firefox\//i.test(ua)) navegador = "Firefox";
  else if (/safari\//i.test(ua) && /version\//i.test(ua)) navegador = "Safari";

  let tipoDispositivo = "Desktop";
  if (/ipad|tablet/i.test(ua)) tipoDispositivo = "Tablet";
  else if (/mobi|iphone|android/i.test(ua)) tipoDispositivo = "Mobile";

  return { navegador, sistemaOperacional, tipoDispositivo };
}

/** Versão do Portal publicada — `VERCEL_GIT_COMMIT_SHA` (preenchida automaticamente pela
 * Vercel em todo deploy) com fallback pra versão do `package.json` em dev local, onde essa env
 * var não existe. */
function resolvePortalVersion(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (sha) return sha.slice(0, 7);
  return `dev-${process.env.npm_package_version ?? "0.0.0"}`;
}

/**
 * Monta os metadados técnicos do relato a partir do request — nunca pedidos ao usuário, sempre
 * inferidos. `rotaOrigem` prioriza o valor explícito mandado pelo cliente (a Fase 2, Caio,
 * deveria mandar `window.location.pathname` no corpo — mais confiável que o header, que pode
 * vir ausente por política de referrer) e cai pro header `referer` (convertido só pro pathname,
 * nunca a URL completa — evita gravar querystring com possível dado sensível) quando ausente.
 * NUNCA lê/grava cookie, header de autorização ou qualquer token — só os campos do tipo
 * `FeedbackMetadata`.
 */
export function buildFeedbackMetadata(req: Request, rotaOrigemExplicita?: string | null): FeedbackMetadata {
  const ua = req.headers.get("user-agent");
  const { navegador, sistemaOperacional, tipoDispositivo } = parseUserAgent(ua);

  let rotaOrigem = rotaOrigemExplicita?.trim() || null;
  if (!rotaOrigem) {
    const referer = req.headers.get("referer");
    if (referer) {
      try {
        rotaOrigem = new URL(referer).pathname;
      } catch {
        rotaOrigem = null;
      }
    }
  }
  // Nunca mais que 300 caracteres — defesa contra um valor absurdo mandado pelo cliente.
  if (rotaOrigem && rotaOrigem.length > 300) rotaOrigem = rotaOrigem.slice(0, 300);

  return { rotaOrigem, navegador, sistemaOperacional, tipoDispositivo, versaoPortal: resolvePortalVersion() };
}

// ---------------------------------------------------------------------------
// Detecção de duplicidade — comparação SIMPLES (nunca bloqueia o envio, só sinaliza).
// ---------------------------------------------------------------------------

function normalizeForCompare(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordSet(text: string): Set<string> {
  return new Set(normalizeForCompare(text).split(" ").filter((w) => w.length >= 3));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export type PossibleDuplicateCandidate = {
  tipo: FeedbackTipo;
  titulo: string;
  descricao: string;
  categoriaId: string | null;
  subcategoriaId: string | null;
  moduloAfetadoTexto: string | null;
};

/**
 * Checagem SIMPLES de duplicidade — comparação de título + módulo + descrição contra relatos
 * recentes do MESMO módulo e MESMO tipo (pedido original). NUNCA bloqueia o envio (ver
 * `POST /api/feedback`) — só devolve o id do candidato mais parecido pra gravar o vínculo
 * (`possivelDuplicataDeId`) e deixar o admin avaliar.
 *
 * Critério: mesmo módulo (`subcategoriaId`, ou `categoriaId` sem subcategoria, ou
 * `moduloAfetadoTexto` normalizado — o que estiver preenchido no candidato) + título
 * normalizado igual/contido OU similaridade de palavras (Jaccard sobre título+descrição) >=
 * 0.5. Olha só os últimos 60 dias e no máximo 50 candidatos — suficiente pro objetivo (avisar o
 * admin da coincidência), sem varrer a tabela inteira a cada novo relato.
 */
export async function findPossibleDuplicate(candidate: PossibleDuplicateCandidate): Promise<string | null> {
  const moduloWhere: Prisma.FeedbackReportWhereInput | null = candidate.subcategoriaId
    ? { subcategoriaId: candidate.subcategoriaId }
    : candidate.categoriaId
      ? { categoriaId: candidate.categoriaId, subcategoriaId: null }
      : candidate.moduloAfetadoTexto
        ? { moduloAfetadoTexto: { equals: candidate.moduloAfetadoTexto, mode: "insensitive" } }
        : null;
  if (!moduloWhere) return null;

  const sessentaDiasAtras = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const recentes = await prisma.feedbackReport.findMany({
    where: { tipo: candidate.tipo, createdAt: { gte: sessentaDiasAtras }, ...moduloWhere },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, titulo: true, descricao: true },
  });

  const candidateTitleNorm = normalizeForCompare(candidate.titulo);
  const candidateWords = wordSet(`${candidate.titulo} ${candidate.descricao}`);

  for (const r of recentes) {
    const titleNorm = normalizeForCompare(r.titulo);
    const tituloParecido =
      titleNorm === candidateTitleNorm ||
      (titleNorm.length >= 8 && candidateTitleNorm.length >= 8 && (titleNorm.includes(candidateTitleNorm) || candidateTitleNorm.includes(titleNorm)));
    if (tituloParecido) return r.id;

    const similarity = jaccardSimilarity(candidateWords, wordSet(`${r.titulo} ${r.descricao}`));
    if (similarity >= 0.5) return r.id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// "Módulo afetado" — Category/Subcategory (lista dinâmica, nunca hardcoded) + fallback texto.
// ---------------------------------------------------------------------------

export type ModuloAfetadoInput = { categoriaId?: string | null; subcategoriaId?: string | null; moduloAfetadoTexto?: string | null };
export type ModuloAfetadoResolved = { categoriaId: string | null; subcategoriaId: string | null; moduloAfetadoTexto: string | null };

/** Valida o "módulo afetado" enviado pelo formulário — exige pelo menos um preenchido, na
 * ordem de prioridade subcategoria > categoria > texto livre (ver comentário de
 * `FeedbackReport.categoriaId` no schema). */
export async function resolveModuloAfetado(
  input: ModuloAfetadoInput
): Promise<{ ok: true; value: ModuloAfetadoResolved } | { ok: false; error: string }> {
  const subcategoriaId = input.subcategoriaId?.trim() || null;
  const categoriaId = input.categoriaId?.trim() || null;
  const moduloAfetadoTexto = input.moduloAfetadoTexto?.trim() || null;

  if (subcategoriaId) {
    const sub = await prisma.subcategory.findUnique({ where: { id: subcategoriaId }, select: { id: true, active: true } });
    if (!sub || !sub.active) return { ok: false, error: "Módulo (subcategoria) inválido." };
    return { ok: true, value: { categoriaId: null, subcategoriaId, moduloAfetadoTexto: null } };
  }
  if (categoriaId) {
    const cat = await prisma.category.findUnique({ where: { id: categoriaId }, select: { id: true, active: true } });
    if (!cat || !cat.active) return { ok: false, error: "Módulo (categoria) inválido." };
    return { ok: true, value: { categoriaId, subcategoriaId: null, moduloAfetadoTexto: null } };
  }
  if (moduloAfetadoTexto && moduloAfetadoTexto.length >= 2) {
    return { ok: true, value: { categoriaId: null, subcategoriaId: null, moduloAfetadoTexto: moduloAfetadoTexto.slice(0, 120) } };
  }
  return { ok: false, error: "Informe o módulo afetado." };
}

// ---------------------------------------------------------------------------
// Filtros compartilhados — listagem admin e dashboard.
// ---------------------------------------------------------------------------

export type FeedbackListFilters = {
  tipo?: string | null;
  status?: string | null;
  prioridade?: string | null;
  categoriaId?: string | null;
  subcategoriaId?: string | null;
  usuarioCriadorId?: string | null;
  empresaId?: string | null;
  from?: Date | null;
  to?: Date | null;
  q?: string | null;
};

export function buildFeedbackWhere(filters: FeedbackListFilters): Prisma.FeedbackReportWhereInput {
  const and: Prisma.FeedbackReportWhereInput[] = [];
  if (filters.tipo) and.push({ tipo: filters.tipo as FeedbackTipo });
  if (filters.status) and.push({ status: filters.status as FeedbackStatus });
  if (filters.prioridade) and.push({ prioridade: filters.prioridade as FeedbackPrioridade });
  if (filters.categoriaId) and.push({ categoriaId: filters.categoriaId });
  if (filters.subcategoriaId) and.push({ subcategoriaId: filters.subcategoriaId });
  if (filters.usuarioCriadorId) and.push({ usuarioCriadorId: filters.usuarioCriadorId });
  if (filters.empresaId) and.push({ empresaId: filters.empresaId });
  if (filters.from || filters.to) {
    and.push({ createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } });
  }
  if (filters.q) {
    and.push({
      OR: [
        { protocolo: { contains: filters.q, mode: "insensitive" } },
        { titulo: { contains: filters.q, mode: "insensitive" } },
        { descricao: { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }
  return and.length > 0 ? { AND: and } : {};
}

// ---------------------------------------------------------------------------
// Rate limiting — proteção básica contra clique duplo/abuso (mesmo util já usado em todo o
// projeto, `src/lib/rate-limit.ts`). Dois limites compostos (os dois são checados, o mais
// apertado dos dois vale):
// 1. `FEEDBACK_CREATE_RATE_LIMIT` — 1 envio a cada 10s por usuário: barra um reenvio acidental
//    (duplo clique, double submit por lentidão de rede).
// 2. `FEEDBACK_CREATE_RATE_LIMIT_HOURLY` — no máximo 20 envios por hora por usuário: o limite
//    de 10s sozinho não impede abuso SUSTENTADO (um script com sleep(10s) criaria ~360
//    relatos/hora indefinidamente, cada um disparando notificação pra todo Administrador —
//    achado do Jonas, revisão de segurança desta tarefa). 20/hora é folgado pra qualquer uso
//    humano legítimo (ninguém reporta 20 bugs/sugestões distintos na mesma hora na prática) e
//    aperta o suficiente pra inviabilizar um loop automatizado.
// ---------------------------------------------------------------------------

export const FEEDBACK_CREATE_RATE_LIMIT = { windowMs: 10_000, max: 1 };
export const FEEDBACK_CREATE_RATE_LIMIT_HOURLY = { windowMs: 60 * 60 * 1000, max: 20 };

/** Limite de caracteres da descrição — mesmo racional dos outros campos de texto livre
 * (`titulo`, `beneficioEsperado`, `comentario`, `conteudo`): generoso o bastante pra descrever
 * o problema/sugestão com detalhe, mas não ilimitado (achado do Jonas — `descricao` era o único
 * campo de texto livre sem nenhum cap). */
export const FEEDBACK_DESCRICAO_MAX_LENGTH = 8000;
