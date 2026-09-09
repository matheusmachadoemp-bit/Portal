"use server";

import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import crypto from "crypto";

// Prioriza NEXTAUTH_URL (já usada em outras partes do app, ex.: link do
// certificado da Universidade) em vez do header Host da requisição: o Host
// é enviado pelo cliente e não é confiável — um agente malicioso poderia
// mandar um Host diferente do domínio real, fazendo o e-mail de recuperação
// de senha incluir um link para um site controlado por ele, com o token
// secreto de redefinição no caminho da URL. Sem NEXTAUTH_URL configurada
// (só deveria acontecer em dev local), cai pro Host da requisição, mas só
// se ele estiver na lista de domínios permitidos (ALLOWED_HOSTS) — sem essa
// lista configurada, qualquer Host passa, então defina ALLOWED_HOSTS se for
// depender desse fallback.
async function getOrigin(): Promise<string> {
  const configuredBaseUrl = process.env.NEXTAUTH_URL;
  if (configuredBaseUrl) return configuredBaseUrl.replace(/\/$/, "");

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const allowedHosts = (process.env.ALLOWED_HOSTS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (allowedHosts.length > 0 && !allowedHosts.includes(host)) {
    throw new Error(`Host não permitido: ${host}`);
  }
  const forwardedProto = h.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${protocol}://${host}`;
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

  // Intervalo mínimo entre pedidos pro mesmo e-mail: sem isso, qualquer um
  // (sem precisar estar logado) conseguiria fazer o portal mandar e-mails
  // sem parar pra uma conta alheia — lotando a caixa de entrada da vítima e
  // consumindo a cota de envio da conta na Resend. `resetTokenExp` já marca
  // quando o pedido anterior foi feito (sempre "agora + 1h" no momento do
  // envio), então dá pra usar ele mesmo pra calcular o intervalo, sem
  // precisar de mais uma coluna só pra isso.
  const jaPediuRecentemente =
    !!user?.resetTokenExp && user.resetTokenExp.getTime() - RESET_TOKEN_TTL_MS > Date.now() - RESET_EMAIL_COOLDOWN_MS;

  if (user && user.active && !jaPediuRecentemente) {
    const token = crypto.randomBytes(24).toString("hex");
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: token,
        resetTokenExp: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    const origin = await getOrigin();
    try {
      await sendPasswordResetEmail(user.email, `${origin}/redefinir-senha/${token}`);
    } catch (err) {
      // Não expõe o erro (nem se o e-mail existe) pra quem preencheu o
      // formulário — só registra no log do servidor pra alguém investigar.
      console.error("Falha ao enviar e-mail de redefinição de senha:", err);
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
