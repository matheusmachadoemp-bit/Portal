import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getVapidStatus, sendPushToSubscription, type PushPayload } from "@/lib/notifications";

/**
 * Rota de diagnóstico de push — qualquer usuário logado pode testar a
 * própria notificação (não precisa ser admin, não manda pra ninguém além
 * de quem chamou). Existe porque, a partir do ambiente onde o Portal é
 * desenvolvido, não há acesso nem ao banco de produção (pra conferir se a
 * `PushSubscription` foi realmente salva) nem aos logs do servidor na
 * Vercel (pra ver se `webpush.sendNotification` falhou e por quê) — esta
 * rota é a forma de obter essa informação na hora, direto na tela, depois
 * de publicada.
 *
 * Diferente do fluxo normal de notificação (`sendPushToUser` em
 * `src/lib/notifications.ts`, que só loga um erro de envio e segue em
 * frente pra nunca travar uma ação de negócio como criar uma tarefa), esta
 * rota devolve o resultado real de cada tentativa — sucesso ou falha, com
 * o status HTTP e a mensagem que o serviço de push respondeu — na própria
 * resposta, pra quem chamou conseguir ler.
 */
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const vapidStatus = getVapidStatus();
    if (!vapidStatus.ok) {
      if (vapidStatus.reason === "missing") {
        return NextResponse.json({ ok: false, reason: "vapid_not_configured", detail: vapidStatus.detail });
      }
      return NextResponse.json({
        ok: false,
        reason: "vapid_invalid",
        detail:
          `As três variáveis de push estão presentes no servidor, mas uma delas tem um valor que a biblioteca rejeitou ao configurar — o mais provável é o formato de VAPID_SUBJECT. ` +
          `Ele precisa ser exatamente "mailto:algum@email.com" (ou uma URL "https://..."), sem espaço logo depois de "mailto:" e sem "<" ">" ao redor do e-mail — o Chrome tolera esses erros de formato, mas o Safari/iPhone rejeita. ` +
          `Detalhe técnico devolvido pela biblioteca: ${vapidStatus.detail}`,
      });
    }

    const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: session.user.id } });
    if (subscriptions.length === 0) {
      return NextResponse.json({
        ok: false,
        reason: "no_subscription",
        detail:
          "Nenhuma assinatura de push encontrada para o seu usuário no banco de dados. Mesmo que o navegador tenha mostrado sucesso ao ativar (o botão virou \"Desativar notificações\"), ela não está salva no servidor — tente desativar e ativar de novo e, se persistir, é sinal de que POST /api/push/subscribe está falhando silenciosamente nesse aparelho.",
      });
    }

    const subjectWarning = describeSuspiciousSubject(process.env.VAPID_SUBJECT);

    const payload: PushPayload = {
      title: "Portal Nord",
      body: "Notificação de teste — se você está vendo isso, o push está funcionando neste aparelho.",
      url: "/portal",
      notificationId: "test",
    };

    const subscriptionResults = await Promise.all(
      subscriptions.map(async (sub) => {
        const result = await sendPushToSubscription(sub, payload);
        return { endpoint: shortenEndpoint(sub.endpoint), ...result };
      })
    );

    const sent = subscriptionResults.filter((r) => r.ok).length;

    return NextResponse.json({
      ok: sent === subscriptionResults.length,
      sent,
      subscriptions: subscriptionResults,
      ...(subjectWarning ? { subjectWarning } : {}),
    });
  } catch (err) {
    // Qualquer erro inesperado (ex.: banco fora do ar) ainda vira uma
    // resposta JSON legível — o objetivo desta rota é nunca deixar quem
    // testou sem explicação nenhuma, nem uma tela de erro genérica do Next.
    return NextResponse.json(
      { ok: false, reason: "unexpected_error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/** Encurta o endpoint só pra exibição — é uma URL bem longa (o serviço de
 * push identifica o dispositivo pelo path inteiro). Mantém o domínio (ajuda
 * a reconhecer FCM/Chrome vs. web.push.apple.com/Safari) e os últimos
 * caracteres (ajuda a diferenciar dois aparelhos quando há mais de uma
 * assinatura na lista). */
function shortenEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    return `${url.host}/…${url.pathname.slice(-10)}`;
  } catch {
    return endpoint.slice(0, 40);
  }
}

/** Aviso auxiliar, só informativo — não muda `ok`/`reason` da resposta. O
 * Safari/APNs (web.push.apple.com) é conhecido por rejeitar um
 * VAPID_SUBJECT com espaço logo após "mailto:" ou com "<" ">" ao redor do
 * e-mail (ex.: "mailto: contato@nordpizza.com"), enquanto Chrome/FCM aceitam
 * esse mesmo valor sem reclamar — o que faz esse tipo de erro de formatação
 * só dar problema no iPhone, nunca no Android/desktop. É fácil cair nessa
 * pegadinha porque o próprio exemplo na documentação da biblioteca
 * `web-push` (JSDoc de `setVapidDetails`) está escrito com o espaço.
 * Ver https://developer.apple.com/forums/thread/725473.
 *
 * `new URL(...)` (usado pela validação local da biblioteca) não pega esse
 * caso — ele ignora espaços/`<>` silenciosamente ao fazer parse — por isso
 * esse valor passa pelo `getVapidStatus()` acima sem virar "vapid_invalid"
 * e só se revela quando o envio de verdade (abaixo) é rejeitado pela Apple. */
function describeSuspiciousSubject(rawSubject: string | undefined): string | null {
  if (!rawSubject) return null;
  const trimmed = rawSubject.trim();
  if (/^mailto:\s/i.test(trimmed) || /[<>]/.test(trimmed)) {
    return (
      'O VAPID_SUBJECT configurado no servidor tem um formato que costuma funcionar no Chrome/Android mas ser rejeitado pelo Safari/iPhone (espaço logo depois de "mailto:" ou uso de "<"/">"). ' +
      'Se algum envio acima falhou, corrija essa variável de ambiente na Vercel para o formato exato "mailto:algum@email.com" (sem espaços extras, sem "<"/">") e publique de novo.'
    );
  }
  if (rawSubject !== trimmed) {
    return "O VAPID_SUBJECT configurado tem espaços ou quebra de linha extra nas pontas — o servidor já ignora isso automaticamente ao usar, mas vale corrigir a variável de ambiente na Vercel pra ficar limpo.";
  }
  return null;
}
