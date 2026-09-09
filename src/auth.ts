import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";

// Proteção simples contra força bruta no login: contador em memória por
// e-mail (reseta a cada deploy — aceitável para o volume de usuários deste
// sistema, algumas dezenas/centenas de contas). Depois de MAX_ATTEMPTS
// tentativas erradas seguidas dentro da janela de ATTEMPT_WINDOW_MS, novas
// tentativas ficam bloqueadas por LOCKOUT_MS, sem avisar o usuário disso —
// o `authorize` só devolve null, a mesma resposta genérica de credenciais
// inválidas.
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

type LoginAttemptState = {
  count: number;
  firstAttemptAt: number;
  lockedUntil: number | null;
};

const loginAttempts = new Map<string, LoginAttemptState>();

function isLockedOut(email: string): boolean {
  const state = loginAttempts.get(email);
  if (!state?.lockedUntil) return false;
  if (Date.now() < state.lockedUntil) return true;
  loginAttempts.delete(email);
  return false;
}

function registerFailedAttempt(email: string): void {
  const now = Date.now();
  const state = loginAttempts.get(email);
  if (!state || now - state.firstAttemptAt > ATTEMPT_WINDOW_MS) {
    loginAttempts.set(email, { count: 1, firstAttemptAt: now, lockedUntil: null });
    return;
  }
  const count = state.count + 1;
  loginAttempts.set(email, {
    count,
    firstAttemptAt: state.firstAttemptAt,
    lockedUntil: count >= MAX_ATTEMPTS ? now + LOCKOUT_MS : null,
  });
}

function clearFailedAttempts(email: string): void {
  loginAttempts.delete(email);
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      authorize: async (credentials) => {
        const email = String(credentials?.email ?? "").toLowerCase().trim();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        if (isLockedOut(email)) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) {
          registerFailedAttempt(email);
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          registerFailedAttempt(email);
          return null;
        }

        clearFailedAttempts(email);

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatarUrl: user.avatarUrl,
        };
      },
    }),
  ],
});
