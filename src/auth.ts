import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";

// Proteção contra força bruta no login: contador gravado no próprio usuário
// (`failedLoginAttempts`/`lockedUntil`), não em memória do processo — em
// produção (Vercel, serverless) cada instância teria sua própria memória, e
// um contador só local não bloqueia nada de verdade sob tráfego real. Depois
// de MAX_ATTEMPTS tentativas erradas seguidas, a conta fica bloqueada por
// LOCKOUT_MS, sem avisar o usuário disso — o `authorize` só devolve null, a
// mesma resposta genérica de credenciais inválidas.
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function isLockedOut(user: { lockedUntil: Date | null }): boolean {
  return !!user.lockedUntil && user.lockedUntil.getTime() > Date.now();
}

async function registerFailedAttempt(userId: string, currentCount: number): Promise<void> {
  const count = currentCount + 1;
  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginAttempts: count,
      lockedUntil: count >= MAX_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : undefined,
    },
  });
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

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) return null;

        if (isLockedOut(user)) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          await registerFailedAttempt(user.id, user.failedLoginAttempts);
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
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
