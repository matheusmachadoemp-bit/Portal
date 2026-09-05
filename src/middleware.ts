import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = [
  "/login",
  "/esqueci-senha",
  "/certificado",
  "/pesquisa",
  "/api/satisfaction/responder",
];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Disparos do Vercel Cron (ex.: sincronizações, cobrança automática do
  // Checklist) chegam sem sessão de usuário — cada rota valida o próprio
  // CRON_SECRET, então deixamos passar aqui para não redirecioná-los ao
  // /login antes de chegarem no handler.
  const isCronRequest =
    !!process.env.CRON_SECRET && req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;

  const isPublic =
    isCronRequest ||
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/internal/diag-loja-nord-menu") ||
    pathname.startsWith("/api/internal/revalidate-menu-cache") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/logo") ||
    pathname === "/favicon.ico";

  if (isPublic) return NextResponse.next();

  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
