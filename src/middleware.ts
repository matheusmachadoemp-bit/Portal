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
  "/recebimento",
  "/api/estoque/recebimento/responder",
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
    pathname.startsWith("/_next") ||
    pathname.startsWith("/logo") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/apple-touch-icon.png" ||
    // Service worker (public/sw.js): precisa ser público como o manifest e os
    // ícones acima — o navegador refaz essa busca periodicamente (checagem de
    // atualização em segundo plano, ~24h) mesmo sem uma aba autenticada aberta
    // na hora; se ficasse atrás do login, essa checagem cairia num redirect
    // pro /login em vez do script, e o worker instalado nunca se atualizaria.
    // O arquivo em si não tem nada sensível — só lógica de push/notification-click.
    pathname === "/sw.js" ||
    /^\/icon-(192|512|maskable-512)\.png$/.test(pathname);

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
