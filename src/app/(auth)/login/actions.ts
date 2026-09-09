"use server";

import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";
import bcrypt from "bcryptjs";
import crypto from "crypto";

// Usa só NEXTAUTH_URL (já usada em outras partes do app, ex.: link do
// certificado da Universidade) pra montar o link de redefinição de senha —
// nunca o header Host da requisição, que é enviado pelo cliente e não é
// confiável: um agente malicioso poderia mandar um Host diferente do
// domínio real, fazendo o e-mail de recuperação de senha incluir um link
// para um site controlado por ele, com o token secreto de redefinição no
// caminho da URL. Sem essa variável configurada, falha visivelmente (mesmo
// raciocínio de vault.ts) em vez de arriscar montar um link errado.
function getOrigin(): string {
  const configuredBaseUrl = process.env.NEXTAUTH_URL;
  if (!configuredBaseUrl) {
    throw new Error("NEXTAUTH_URL não configurada — obrigatória para montar links de e-mail.");
  }
  return configuredBaseUrl.replace(/\/$/, "");
}

const RESET_TOKEN_TTL_MS = 1000 * 60 * 60;
const RESET_EMAIL_COOLDOWN_MS = 60 * 1000;

export async function loginAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const callbackUrl = String(formData.get("callbackUrl") ?? "/");

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: callbackUrl || "/",
    });
    return {};
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "E-mail ou senha incorretos." };
    }
    throw err;
  }
}

export async function forgotPasswordAction(
  _prevState: { message?: string } | undefined,
  formData: FormData
): Promise<{ message?: string }> {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });

  if (user && user.active) {
    const token = crypto.randomBytes(24).toString("hex");

    // Intervalo mínimo entre pedidos pro mesmo e-mail: sem isso, qualquer um
    // (sem precisar estar logado) conseguiria fazer o portal mandar e-mails
    // sem parar pra uma conta alheia — lotando a caixa de entrada da vítima
    // e consumindo a cota de envio da conta na Resend. `resetTokenExp` já
    // marca quando o pedido anterior foi feito (sempre "agora + 1h" no
    // momento do envio), então dá pra usar ele mesmo pra calcular o
    // intervalo, sem precisar de mais uma coluna só pra isso.
    //
    // O check-e-grava é feito num único UPDATE (updateMany com WHERE),
    // não como um SELECT seguido de um UPDATE separado — assim duas
    // requisições simultâneas não conseguem ler o mesmo "ainda não pediu
    // recentemente" antes de qualquer uma delas gravar, o que deixaria a
    // trava de 60s furável só por mandar os pedidos em paralelo.
    const allowedIfRequestedBefore = new Date(Date.now() + RESET_TOKEN_TTL_MS - RESET_EMAIL_COOLDOWN_MS);
    const { count } = await prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [{ resetTokenExp: null }, { resetTokenExp: { lte: allowedIfRequestedBefore } }],
      },
      data: { resetToken: token, resetTokenExp: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
    });

    if (count > 0) {
      const origin = getOrigin();
      try {
        await sendPasswordResetEmail(user.email, `${origin}/redefinir-senha/${token}`);
      } catch (err) {
        // Não expõe o erro (nem se o e-mail existe) pra quem preencheu o
        // formulário — só registra no log do servidor pra alguém investigar.
        console.error("Falha ao enviar e-mail de redefinição de senha:", err);
      }
    }
  }

  return {
    message:
      "Se o e-mail informado existir em nossa base, você receberá instruções de recuperação de senha em instantes.",
  };
}

export async function resetPasswordAction(
  token: string,
  _prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const novaSenha = String(formData.get("password") ?? "");
  const confirmacao = String(formData.get("passwordConfirm") ?? "");

  if (novaSenha.length < 6) {
    return { error: "A senha precisa ter pelo menos 6 caracteres." };
  }
  if (novaSenha !== confirmacao) {
    return { error: "As senhas não coincidem." };
  }

  const user = await prisma.user.findFirst({ where: { resetToken: token } });
  if (!user || !user.resetTokenExp || user.resetTokenExp < new Date()) {
    return { error: "Link inválido ou expirado. Solicite uma nova recuperação de senha." };
  }

  const passwordHash = await bcrypt.hash(novaSenha, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetToken: null, resetTokenExp: null },
  });

  return { success: true };
}
