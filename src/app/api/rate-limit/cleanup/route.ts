import { NextResponse } from "next/server";
import { cleanupOldRateLimitHits } from "@/lib/rate-limit";

/**
 * Limpa linhas velhas de `RateLimitHit` (toda tentativa, mesmo dentro do
 * limite, grava/atualiza uma linha — sem limpeza a tabela cresceria pra
 * sempre). Disparo agendado (Vercel Cron, ver vercel.json), autenticado via
 * CRON_SECRET — mesmo padrão das demais rotas de cron do projeto.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const removed = await cleanupOldRateLimitHits();

  return NextResponse.json({ ok: true, removed });
}
