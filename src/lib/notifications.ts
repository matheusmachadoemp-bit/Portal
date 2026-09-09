import webpush, { WebPushError } from "web-push";
import { prisma } from "@/lib/prisma";
import type { Notification, NotificationPriority } from "@prisma/client";

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

type PushPayload = {
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

let vapidConfigured: boolean | null = null;

/** Carrega as chaves VAPID do ambiente uma única vez. Sem elas configuradas
 * (ex.: ambiente de desenvolvimento local sem `.env`), o push simplesmente
 * não é enviado — a Notification continua sendo gravada normalmente, o
 * sino do portal não depende do push pra funcionar. */
function configureVapid(): boolean {
  if (vapidConfigured !== null) return vapidConfigured;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    console.warn(
      "[push] VAPID não configurado (NEXT_PUBLIC_VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT) — notificações push desativadas, só o sino interno vai funcionar."
    );
    vapidConfigured = false;
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

/** Envia o push pra todos os dispositivos inscritos de um usuário, em
 * paralelo. Nunca lança: um erro de envio (endpoint inválido, push service
 * fora do ar, etc.) é só logado, pra nunca quebrar o fluxo de negócio que
 * chamou createNotification. Assinatura expirada/revogada (404/410) é
 * removida do banco — limpeza automática, sem lixo acumulando. */
async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!configureVapid()) return;

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return;

  const payloadJson = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payloadJson);
      } catch (err) {
        const statusCode = err instanceof WebPushError ? err.statusCode : undefined;
        if (statusCode === 404 || statusCode === 410) {
          // Assinatura morta (navegador revogou, usuário desinstalou o PWA, etc.) — apaga.
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error(`[push] falha ao enviar para o endpoint de ${userId}:`, err);
        }
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
