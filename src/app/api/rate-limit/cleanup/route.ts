import { NextResponse } from "next/server";
import { isValidCronSecret } from "@/lib/cron-auth";
import { cleanupOldRateLimitHits } from "@/lib/rate-limit";

/**
 * Limpa linhas velhas de `RateLimitHit` (toda tentativa, mesmo dentro do
 * limite, grava/atualiza uma linha — sem limpeza a tabela cresceria pra
 * sempre). Disparo agendado (Vercel Cron, ver vercel.json), autenticado via
 * CRON_SECRET — mesmo padrão das demais rotas de cron do projeto.
 */
export async function GET(req: Request) {
  // Comparação timing-safe (ver src/lib/cron-auth.ts) — achado do Jonas, auditoria de
  // segurança 2026-11: comparação de string simples (`===`) é vulnerável a timing attack.
  if (!(await isValidCronSecret(req.headers.get("authorization")))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const removed = await cleanupOldRateLimitHits();

  return NextResponse.json({ ok: true, removed });
}
