import webpush, { WebPushError } from "web-push";
import { prisma } from "@/lib/prisma";
import type { Notification, NotificationPriority, PushSubscription } from "@prisma/client";

/**
 * Helper central de notificação — todo lugar do sistema que hoje precisa
 * avisar um usuário (sino do portal) deve passar por aqui em vez de chamar
 * `prisma.notification.create`/`createMany` direto. Além de gravar a
 * `Notification` (mesmos campos de sempre, usados pelo sino em
 * src/components/sidebar/notification-bell.tsx e por src/app/api/notificacoes/*),
 * dispara também um push de verdade (Web Push) para cada dispositivo
 * inscrito daquele usuário — o colaborador recebe o aviso no celular mesmo
 * com o app fechado.
 *
 * `url` é só para o payload do push (o service worker usa pra abrir a aba
 * certa ao clicar) — não existe coluna correspondente em `Notification`,
 * então nunca é persistida; o sino continua decidindo pra onde navegar a
 * partir de taskId/checklistOccurrenceId/chamadoId/purchaseId/goalId, do
 * jeito que já fazia.
 */
export type CreateNotificationInput = {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  priority?: NotificationPriority | null;
  taskId?: string | null;
  checklistOccurrenceId?: string | null;
  chamadoId?: string | null;
  goalId?: string | null;
  purchaseId?: string | null;
  /** URL relativa (ex.: "/portal/tarefas") pra abrir/focar ao clicar no push. Default: "/portal". */
  url?: string | null;
};

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  /** Id da Notification gravada — só disponível na variante individual
   * (createNotification); createMany não devolve os ids gerados, então na
   * variante em lote esse campo vem ausente. O service worker não depende
   * dele para nada hoje (só usa title/body/url), é só um extra pra debug /
   * uso futuro. */
  notificationId?: string;
};

/** Resultado de checar/configurar as chaves VAPID — usado tanto
 * internamente (`configureVapid`, com cache) quanto pela rota de
 * diagnóstico `POST /api/push/test` (`getVapidStatus`, sem cache) pra
 * explicar exatamente por que o push não está disponível no servidor:
 * variável faltando (`"missing"`) vs. valor presente mas rejeitado ao
 * configurar (`"invalid"` — ex.: VAPID_SUBJECT sem "mailto:"/"https:", o
 * que faz `webpush.setVapidDetails` lançar uma exceção síncrona). */
export type VapidStatus = { ok: true } | { ok: false; reason: "missing" | "invalid"; detail: string };

let vapidConfigured: boolean | null = null;

/** Confere e configura as chaves VAPID a partir do ambiente — nunca lança.
 * `.trim()` nos três valores porque um espaço ou quebra de linha invisível
 * colado no campo de variável de ambiente da Vercel é um erro comum e não
 * dá nenhum aviso visual de que aconteceu.
 *
 * Importante: `webpush.setVapidDetails` valida o `subject` e lança uma
 * exceção *síncrona* (não uma Promise rejeitada) se o formato for inválido
 * (não começar com "mailto:" ou "https:"). Antes desta função capturar
 * isso, uma VAPID_SUBJECT mal configurada quebrava (exceção não tratada,
 * HTTP 500) a rota de negócio inteira que chamou createNotification/
 * createNotifications (ex.: criar ou atribuir uma tarefa em
 * `POST /api/tarefas`) — não só o envio do push, que era o único efeito
 * colateral documentado/esperado. */
function checkVapidConfig(): VapidStatus {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();

  const missing = [
    !publicKey && "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    !privateKey && "VAPID_PRIVATE_KEY",
    !subject && "VAPID_SUBJECT",
  ].filter((name): name is string => !!name);

  if (missing.length > 0) {
    return {
      ok: false,
      reason: "missing",
      detail: `Variável(is) de ambiente não configurada(s) no servidor: ${missing.join(", ")}.`,
    };
  }

  try {
    webpush.setVapidDetails(subject as string, publicKey as string, privateKey as string);
  } catch (err) {
    return { ok: false, reason: "invalid", detail: err instanceof Error ? err.message : String(err) };
  }

  return { ok: true };
}

/** Versão cacheada de `checkVapidConfig`, usada em todo envio de push real
 * (as variáveis de ambiente não mudam durante a vida do processo, não vale
 * a pena reconfigurar a cada notificação). Sem VAPID configurado
 * corretamente, o push simplesmente não é enviado — a Notification
 * continua sendo gravada normalmente, o sino do portal não depende do push
 * pra funcionar. */
function configureVapid(): boolean {
  if (vapidConfigured !== null) return vapidConfigured;

  const status = checkVapidConfig();
  vapidConfigured = status.ok;
  if (!status.ok) {
    console.warn(
      `[push] VAPID não configurado corretamente (${status.reason}): ${status.detail} — notificações push desativadas, só o sino interno vai funcionar.`
    );
  }
  return vapidConfigured;
}

/** Estado atual da configuração VAPID, sem cache — usado por
 * `POST /api/push/test` pra sempre refletir o valor mais recente das
 * variáveis de ambiente e devolver o motivo exato (faltando vs. inválido)
 * na resposta, em vez de só um aviso genérico de log. */
export function getVapidStatus(): VapidStatus {
  return checkVapidConfig();
}

/** Resultado detalhado de uma tentativa de envio — sucesso com o status
 * code devolvido pelo serviço de push, ou falha com status code (quando
 * disponível) e a mensagem/corpo que o serviço respondeu. */
export type PushSendResult = { ok: true; statusCode: number } | { ok: false; statusCode?: number; error: string };

/** Envia um push pra uma assinatura específica e devolve o resultado
 * detalhado — sucesso/erro, status code e o que o serviço de push (FCM,
 * APNs/web.push.apple.com etc.) respondeu — em vez de só logar. Reaproveitada
 * tanto por `sendPushToUser` (envio "de verdade", que ignora o resultado e
 * só loga em caso de erro, pra nunca travar quem chamou createNotification)
 * quanto pela rota de diagnóstico `POST /api/push/test` (que devolve esse
 * resultado pro chamador). Assinatura expirada/revogada (404/410) é
 * removida do banco nos dois casos — limpeza automática, sem lixo
 * acumulando. Pressupõe que `webpush.setVapidDetails` já foi chamado (ver
 * `configureVapid`/`getVapidStatus`) — esta função não configura VAPID. */
export async function sendPushToSubscription(
  sub: Pick<PushSubscription, "id" | "endpoint" | "p256dh" | "auth">,
  payload: PushPayload
): Promise<PushSendResult> {
  try {
    const res = await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return { ok: true, statusCode: res.statusCode };
  } catch (err) {
    if (err instanceof WebPushError) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        // Assinatura morta (navegador revogou, usuário desinstalou o PWA, etc.) — apaga.
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      }
      return { ok: false, statusCode: err.statusCode, error: err.body.trim() || err.message };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Envia o push pra todos os dispositivos inscritos de um usuário, em
 * paralelo. Nunca lança: um erro de envio (endpoint inválido, push service
 * fora do ar, etc.) é só logado, pra nunca quebrar o fluxo de negócio que
 * chamou createNotification. */
async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!configureVapid()) return;

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return;

  await Promise.all(
    subscriptions.map(async (sub) => {
      const result = await sendPushToSubscription(sub, payload);
      if (!result.ok) {
        console.error(`[push] falha ao enviar para o endpoint de ${userId} (status ${result.statusCode ?? "?"}):`, result.error);
      }
    })
  );
}

function toNotificationData(data: CreateNotificationInput) {
  return {
    userId: data.userId,
    type: data.type,
    title: data.title,
    body: data.body ?? null,
    priority: data.priority ?? null,
    taskId: data.taskId ?? null,
    checklistOccurrenceId: data.checklistOccurrenceId ?? null,
    chamadoId: data.chamadoId ?? null,
    goalId: data.goalId ?? null,
    purchaseId: data.purchaseId ?? null,
  };
}

/** Grava uma Notification e dispara o push — uso: um destinatário por vez. */
export async function createNotification(data: CreateNotificationInput): Promise<Notification> {
  const notification = await prisma.notification.create({ data: toNotificationData(data) });

  await sendPushToUser(data.userId, {
    title: data.title,
    body: data.body ?? "",
    url: data.url ?? "/portal",
    notificationId: notification.id,
  });

  return notification;
}

/** Variante em lote — vários destinatários de uma vez (ex.: todos os
 * gerentes de uma loja). Grava todas as Notifications numa única query
 * (mesmo padrão de `createMany` já usado antes) e dispara os pushes em
 * paralelo — preserva o paralelismo que já existia nesses pontos. */
export async function createNotifications(inputs: CreateNotificationInput[]): Promise<void> {
  if (inputs.length === 0) return;

  await prisma.notification.createMany({ data: inputs.map(toNotificationData) });

  await Promise.all(
    inputs.map((data) =>
      sendPushToUser(data.userId, {
        title: data.title,
        body: data.body ?? "",
        url: data.url ?? "/portal",
      })
    )
  );
}
