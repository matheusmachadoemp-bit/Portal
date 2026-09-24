import { prisma } from "@/lib/prisma";

// Proteção genérica contra força bruta/abuso em rotas públicas ou sensíveis
// (login, esqueci minha senha, links de token público de recebimento/
// pesquisa/certificado). Mesmo padrão de contador atômico gravado no
// Postgres já usado por `registerFailedAttempt` (src/auth.ts) — nunca em
// memória do processo, porque em produção (Vercel, serverless) cada
// instância teria sua própria memória e um contador só local não bloqueia
// nada de verdade sob tráfego real distribuído entre instâncias.
//
// Uso típico numa rota/Server Action:
//
//   const ip = getClientIp(req.headers); // ou getClientIp(await headers()) numa Server Action/Server Component
//   const allowed = await checkRateLimit(`login:${ip}`, { windowMs: 15 * 60 * 1000, max: 30 });
//   if (!allowed) return NextResponse.json({ error: "Muitas tentativas, aguarde alguns minutos." }, { status: 429 });

export interface RateLimitOptions {
  /** Duração da janela, em milissegundos (ex.: 15 * 60 * 1000 = 15 minutos). */
  windowMs: number;
  /** Quantidade máxima de tentativas permitidas dentro da janela. */
  max: number;
}

/**
 * Registra uma tentativa para `key` e devolve se ela está dentro do limite
 * (`true`) ou se o limite já foi estourado (`false`).
 *
 * Implementação em duas etapas, mesmo raciocínio de `registerFailedAttempt`:
 *
 * 1. Se já existe uma linha para `key` e a janela dela já expirou
 *    (`windowStart` mais velho que `windowMs`), reinicia a janela (zera
 *    `count`, atualiza `windowStart` pra agora) num único `updateMany`
 *    condicional — sem isso o contador nunca "esfria" depois de estourado.
 * 2. Cria a linha (primeira tentativa desta `key`) ou incrementa `count`
 *    atomicamente via `upsert`/`increment` (não lendo e regravando um valor
 *    — Prisma compila isso para um `INSERT ... ON CONFLICT DO UPDATE`
 *    atômico no Postgres), para que tentativas concorrentes da mesma `key`
 *    não leiam o mesmo valor antigo e cada uma grave "+1" a partir dele,
 *    perdendo um incremento e deixando passar mais tentativas do que o
 *    limite configurado.
 */
export async function checkRateLimit(key: string, { windowMs, max }: RateLimitOptions): Promise<boolean> {
  const now = new Date();
  const windowExpiredBefore = new Date(now.getTime() - windowMs);

  await prisma.rateLimitHit.updateMany({
    where: { key, windowStart: { lt: windowExpiredBefore } },
    data: { windowStart: now, count: 0 },
  });

  const hit = await prisma.rateLimitHit.upsert({
    where: { key },
    create: { key, windowStart: now, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true },
  });

  return hit.count <= max;
}

// `x-forwarded-for` sozinho NÃO é confiável pra rate limiting: é um header
// comum que o próprio CLIENTE pode mandar com qualquer valor — em produção
// a Vercel acrescenta o IP real numa nova entrada da lista, mas não
// necessariamente remove o que o cliente mandou antes, então "pegar o
// primeiro valor" pode pegar um IP forjado, deixando o atacante trocar de
// "IP" a cada tentativa e nunca fechar o contador (achado do Teulis, task
// #320). Por isso `x-vercel-forwarded-for` vem PRIMEIRO: é injetado pela
// borda da própria Vercel (não repassável/forjável pelo cliente) — ver
// https://vercel.com/docs/edge-network/headers#x-vercel-forwarded-for.
// `x-forwarded-for` (com todo o cuidado de pegar só o primeiro valor da
// lista "cliente, proxy1, proxy2...") fica só como fallback pra continuar
// funcionando em `next dev` local, que não passa pela borda da Vercel e por
// isso nunca tem `x-vercel-forwarded-for`. Sem nenhum dos headers, cai num
// valor fixo — nesse caso todo tráfego local compartilha o mesmo contador,
// o que é aceitável (nunca é o caso em produção atrás da Vercel) e melhor
// do que quebrar a proteção silenciosamente.
export function getClientIp(headers: Headers): string {
  const vercelForwardedFor = headers.get("x-vercel-forwarded-for");
  if (vercelForwardedFor?.trim()) return vercelForwardedFor.trim();

  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();
  return "unknown";
}

// Usada só pelo cron de limpeza (src/app/api/rate-limit/cleanup/route.ts) —
// qualquer linha não tocada (`updatedAt`) há mais que isso já teve sua
// janela expirada há muito tempo (a maior janela em uso hoje entre os 7
// pontos protegidos é 15min), então pode ser apagada com folga.
export const RATE_LIMIT_CLEANUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function cleanupOldRateLimitHits(): Promise<number> {
  const cutoff = new Date(Date.now() - RATE_LIMIT_CLEANUP_MAX_AGE_MS);
  const { count } = await prisma.rateLimitHit.deleteMany({ where: { updatedAt: { lt: cutoff } } });
  return count;
}
