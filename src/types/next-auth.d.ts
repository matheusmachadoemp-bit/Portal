import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    // Só vem preenchido no retorno de `authorize()` (ver `src/auth.ts`),
    // no momento exato do login — `true` quando `lastLoginAt` do usuário
    // ainda era `null` antes deste login (nunca tinha logado antes).
    isFirstLogin?: boolean;
  }

  interface Session {
    user: {
      id: string;
      role: string;
      avatarUrl: string | null;
      // Ausente/`false` na maioria das sessões; `true` só na sessão criada
      // pelo primeiro login de verdade de um usuário novo, e só até o
      // usuário deslogar ou a sessão expirar (até 8h, `maxAge` em
      // `auth.config.ts`) — não é recalculado a cada requisição.
      isFirstLogin?: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    isFirstLogin?: boolean;
  }
}
