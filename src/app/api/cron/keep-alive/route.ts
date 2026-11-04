import { NextResponse } from "next/server";
import { isValidCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";

/**
 * "Ping" para manter o banco (Neon, plano Free) acordado — o autosuspend do
 * Neon desliga o compute depois de alguns minutos sem uso, e a próxima
 * consulta real do usuário paga o custo de "acordar" o banco (vários
 * segundos). Disparado pelo Vercel Cron nativo a cada 4 min (plano Pro —
 * ver vercel.json), autenticado via CRON_SECRET — mesmo padrão das demais
 * rotas de cron do projeto. Antes do upgrade pro Pro, o Vercel Cron do
 * plano Hobby só permitia 1 execução por dia (não servia pra manter o
 * banco acordado), então esse ping rodava por um workflow redundante no
 * GitHub Actions — removido depois do upgrade, já que o Vercel Cron
 * nativo passou a cobrir a mesma frequência direto.
 */
export async function GET(req: Request) {
  // Comparação timing-safe (ver src/lib/cron-auth.ts) — achado do Jonas, auditoria de
  // segurança 2026-11: comparação de string simples (`===`) é vulnerável a timing attack.
  if (!(await isValidCronSecret(req.headers.get("authorization")))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.$queryRaw`SELECT 1`;

  return NextResponse.json({ ok: true, timestamp: new Date().toISOString() });
}
