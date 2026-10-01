import { NextResponse } from "next/server";
import { processStockCountReminders } from "@/lib/estoque-server";

/**
 * Disparo agendado (GitHub Actions, ver .github/workflows/estoque-contagem-lembretes.yml — mais
 * o reforço diário do Vercel Cron, ver vercel.json), autenticado via CRON_SECRET — mesmo padrão
 * de /api/checklist/escalations/run e /api/fechamento-dia/alertas/run: o cron nativo do Vercel
 * Hobby só permite 1 execução diária por cron e não garante disparar num minuto exato, então a
 * cadência real (a cada poucos minutos, durante o horário comercial) vem do GitHub Actions.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processStockCountReminders();
  return NextResponse.json({ ok: true, ...result });
}
