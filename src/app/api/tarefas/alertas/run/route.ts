import { NextResponse } from "next/server";
import { processTaskAtrasoAlertas } from "@/lib/tarefas-server";

/**
 * Disparo agendado (Vercel Cron nativo, ver vercel.json), autenticado via CRON_SECRET — mesmo
 * padrão de checklist/escalations/run, fechamento-dia/alertas/run e
 * manutencao/chamados/alertas/run. Ver `processTaskAtrasoAlertas` (@/lib/tarefas-server.ts) para
 * a lógica de negócio: notifica cada responsável e quem criou a tarefa quando o prazo (`dueDate`)
 * vence sem a tarefa ter sido concluída.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processTaskAtrasoAlertas();

  return NextResponse.json({ ok: true, ...result });
}
