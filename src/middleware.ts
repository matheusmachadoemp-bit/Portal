import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = [
  "/login",
  "/esqueci-senha",
  "/redefinir-senha",
  "/certificado",
  "/pesquisa",
  "/api/satisfaction/responder",
  "/recebimento",
  "/api/estoque/recebimento/responder",
  "/avaliar",
  "/api/satisfacao-cliente/responder",
  // Reservas — Etapa 3: página pública de reserva (sem login) + as duas rotas de API públicas que
  // ela consome (consulta de disponibilidade e criação da reserva). Prefixo `/api/reservar`
  // (verbo) de propósito — não bate por `startsWith` com `/api/reservas` (substantivo, rotas
  // autenticadas da Etapa 1/2: na 13ª posição da string uma tem "r" e a outra "s").
  "/reservar",
  "/api/reservar",
];

// Caminhos públicos liberados por IGUALDADE exata (não por prefixo): rota nova criada embaixo deles
// não nasce pública. Entrada dos lançamentos do banco (Open Finance): chamada por uma "ponte" sem
// sessão de usuário; a rota exige a senha de integração (BANK_SYNC_SECRET) e recusa tudo se ela não
// estiver definida.
const PUBLIC_EXACT_PATHS = ["/api/financeiro/conciliacao/sync"];

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
    PUBLIC_EXACT_PATHS.includes(pathname) ||
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
