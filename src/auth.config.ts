import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.role = (user as { role: string }).role;
        token.id = user.id as string;
        token.avatarUrl = (user as { avatarUrl: string | null }).avatarUrl;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        (session.user as typeof session.user & { role: string; id: string; avatarUrl: string | null }).role =
          token.role as string;
        (session.user as typeof session.user & { role: string; id: string; avatarUrl: string | null }).id =
          token.id as string;
        (session.user as typeof session.user & { role: string; id: string; avatarUrl: string | null }).avatarUrl =
          (token.avatarUrl as string | null) ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
