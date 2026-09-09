import { Resend } from "resend";

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
