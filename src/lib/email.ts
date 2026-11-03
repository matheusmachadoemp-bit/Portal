import { Resend } from "resend";

// Escape de HTML para qualquer texto livre digitado pelo cliente (ex. `customerName`, vindo do
// formulário público de reserva, sem login e sem validação de conteúdo) antes de interpolar
// dentro de um template de e-mail HTML. Sem isso, um "nome" como `<a href="...">clique aqui</a>`
// virava link/tag de verdade no e-mail enviado pro endereço escolhido pelo próprio atacante
// (achado de segurança do Jonas, tarefa #187 — `customerEmail` também não tem verificação de
// posse, só formato, então o Portal Nord acabava sendo usado como ferramenta de phishing/spam
// com a reputação do domínio da loja). Não há nenhum helper de escape de HTML já existente no
// projeto (nada equivalente em outro lugar que renderize texto de usuário em e-mail/PDF), então
// esta função simples (sem biblioteca externa) resolve.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Sem chave configurada, falha visivelmente (ver vault.ts para o mesmo
// raciocínio): melhor um erro claro em produção do que enviar e-mails que
// nunca chegam a lugar nenhum, ou pior, engolir o erro em silêncio e deixar
// o usuário achando que "instruções foram enviadas".
function getClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY não configurada — obrigatória para enviar e-mails.");
  }
  return new Resend(apiKey);
}

// "onboarding@resend.dev" é o remetente de teste da própria Resend: funciona
// sem precisar verificar um domínio próprio, mas tem reputação/entregabilidade
// pior (pode cair em spam) — assim que houver um domínio verificado na conta
// Resend, defina EMAIL_FROM (ex.: "Portal Nord <naoresponda@nordpizza.com>").
const DEFAULT_FROM = "Portal Nord <onboarding@resend.dev>";

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const resend = getClient();
  const from = process.env.EMAIL_FROM || DEFAULT_FROM;

  const { error } = await resend.emails.send({
    from,
    to,
    subject: "Redefinição de senha — Portal Nord",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
        <h2 style="margin-bottom: 8px;">Redefinir sua senha</h2>
        <p>Recebemos um pedido para redefinir a senha da sua conta no Portal Nord.</p>
        <p>
          <a href="${resetUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Redefinir senha
          </a>
        </p>
        <p style="color: #666; font-size: 13px;">Esse link expira em 1 hora. Se você não pediu essa redefinição, pode ignorar este e-mail.</p>
      </div>
    `,
  });

  if (error) {
    throw new Error(`Falha ao enviar e-mail via Resend: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Reservas — notificação por e-mail ao cliente quando a loja aprova/recusa a solicitação inicial
// (ver tarefa "reservas-unificar-calendario", item #5, e `PATCH /api/reservas/reservas/[id]`, que
// chama as duas funções abaixo). Fluxo de negócio confirmado pelo Matheus: cliente manda
// solicitação (PENDENTE) -> loja confere vaga -> aprova (CONFIRMADA) ou recusa (CANCELADA). Até
// esta tarefa não existia NENHUM envio de e-mail no fluxo de Reservas (nem confirmação de
// recebimento da solicitação) — funcionalidade nova, mesmo padrão simples (HTML inline) de
// `sendPasswordResetEmail` acima, sem reaproveitar nada específico de Reservas (não havia nada).
// ---------------------------------------------------------------------------

export type ReservationEmailDetails = {
  /** Nome do cliente (ou "cliente", se a reserva não tiver nome — nunca deveria faltar na
   * prática, mas o campo é nullable no schema). Usado só pra saudação, não afeta o envio. */
  customerName: string;
  empresaName: string;
  environmentName: string;
  /** "DD/MM/AAAA", já formatado no fuso de São Paulo (ver `buildReservationEmailDetails`,
   * `src/app/api/reservas/reservas/[id]/route.ts`) — este módulo não faz nenhuma conta de
   * data/fuso por conta própria. */
  dateBR: string;
  /** "HH:mm", já formatado no fuso de São Paulo (mesma observação acima). */
  timeHHMM: string;
  partySize: number;
};

function reservationDetailsHtml(details: ReservationEmailDetails): string {
  return `
    <ul style="padding-left: 18px; margin: 12px 0;">
      <li>Data: ${details.dateBR}</li>
      <li>Horário: ${details.timeHHMM}</li>
      <li>Ambiente: ${details.environmentName}</li>
      <li>Pessoas: ${details.partySize}</li>
    </ul>
  `;
}

/** Enviado quando a loja aprova uma solicitação de reserva (PENDENTE -> CONFIRMADA). */
export async function sendReservationAcceptedEmail(to: string, details: ReservationEmailDetails): Promise<void> {
  const resend = getClient();
  const from = process.env.EMAIL_FROM || DEFAULT_FROM;

  const { error } = await resend.emails.send({
    from,
    to,
    subject: `Reserva confirmada — ${details.empresaName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
        <h2 style="margin-bottom: 8px;">Reserva confirmada!</h2>
        <p>Olá, ${escapeHtml(details.customerName)}! Sua reserva na <strong>${details.empresaName}</strong> foi confirmada:</p>
        ${reservationDetailsHtml(details)}
        <p>Esperamos você!</p>
      </div>
    `,
  });

  if (error) {
    throw new Error(`Falha ao enviar e-mail via Resend: ${error.message}`);
  }
}

/**
 * Enviado quando a loja cancela uma reserva — tanto a recusa de uma solicitação ainda PENDENTE
 * (caso principal pedido pelo Matheus) quanto o cancelamento de uma reserva JÁ CONFIRMADA
 * (extensão de bom senso: quem já tinha recebido a confirmação merece saber que ela foi
 * cancelada — ver decisão documentada em `PATCH /api/reservas/reservas/[id]`). `wasConfirmed`
 * só muda o texto (nunca a estrutura/assunto do e-mail, que seguem o mesmo padrão simples).
 */
export async function sendReservationCancelledEmail(
  to: string,
  details: ReservationEmailDetails & { wasConfirmed: boolean }
): Promise<void> {
  const resend = getClient();
  const from = process.env.EMAIL_FROM || DEFAULT_FROM;

  const subject = details.wasConfirmed
    ? `Reserva cancelada — ${details.empresaName}`
    : `Não foi possível confirmar sua reserva — ${details.empresaName}`;

  const intro = details.wasConfirmed
    ? `Avisamos que sua reserva confirmada na <strong>${details.empresaName}</strong>, abaixo, foi cancelada:`
    : `Infelizmente não foi possível atender sua solicitação de reserva na <strong>${details.empresaName}</strong>, abaixo:`;

  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
        <h2 style="margin-bottom: 8px;">${details.wasConfirmed ? "Reserva cancelada" : "Não foi possível confirmar sua reserva"}</h2>
        <p>Olá, ${escapeHtml(details.customerName)}. ${intro}</p>
        ${reservationDetailsHtml(details)}
        <p style="color: #666; font-size: 13px;">Pedimos desculpas pelo inconveniente. Entre em contato com a loja para mais informações${details.wasConfirmed ? " ou para reagendar" : ""}.</p>
      </div>
    `,
  });

  if (error) {
    throw new Error(`Falha ao enviar e-mail via Resend: ${error.message}`);
  }
}
