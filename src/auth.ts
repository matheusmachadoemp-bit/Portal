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

// Incrementa atomicamente (via `increment`, não lendo e regravando um valor)
// para que tentativas erradas simultâneas (paralelas) não pisem uma na outra
// e escapem do bloqueio — um `findUnique` seguido de `update({ count + 1 })`
// permite que duas requisições concorrentes leiam o mesmo valor antigo e
// cada uma grave "+1" a partir dele, perdendo um incremento.
async function registerFailedAttempt(userId: string): Promise<void> {
  // Se o bloqueio anterior já expirou, reinicia o contador antes de somar a
  // nova tentativa — sem isso o contador nunca "esfria": uma única senha
  // errada depois do desbloqueio já reativaria os 15 minutos de novo,
  // travando a conta indefinidamente com uma tentativa a cada 15 minutos.
  await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }],
      failedLoginAttempts: { gte: MAX_ATTEMPTS },
    },
    data: { failedLoginAttempts: 0 },
  });

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: { increment: 1 } },
    select: { failedLoginAttempts: true },
  });
  if (updated.failedLoginAttempts >= MAX_ATTEMPTS) {
    await prisma.user.update({
      where: { id: userId },
      data: { lockedUntil: new Date(Date.now() + LOCKOUT_MS) },
    });
  }
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
          await registerFailedAttempt(user.id);
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
