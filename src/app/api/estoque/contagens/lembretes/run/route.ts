import { NextResponse } from "next/server";
import { processStockCountReminders } from "@/lib/estoque-server";

/**
 * Disparo agendado (Vercel Cron nativo, plano Pro, a cada 15 min — ver vercel.json),
 * autenticado via CRON_SECRET — mesmo padrão de /api/checklist/escalations/run e
 * /api/fechamento-dia/alertas/run. Antes do upgrade pro Pro, o cron nativo do Vercel Hobby só
 * permitia 1 execução diária e não garantia disparar num minuto exato, então a cadência real (a
 * cada 15 min) vinha de um workflow redundante no GitHub Actions — removido depois do upgrade,
 * já que o Vercel Cron nativo passou a cobrir a mesma frequência direto.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processStockCountReminders();
  return NextResponse.json({ ok: true, ...result });
}
