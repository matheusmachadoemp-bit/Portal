import { NextResponse } from "next/server";
import { processFechamentoAlertas } from "@/lib/fechamento-server";

/**
 * Disparo agendado (Vercel Cron, ver vercel.json — roda pouco depois da meia-noite de São
 * Paulo, depois que o prazo de "ontem" já venceu), autenticado via CRON_SECRET. Ver
 * `processFechamentoAlertas` (@/lib/fechamento-server) para a lógica de negócio: notifica o
 * dono (usuários ADMINISTRADOR) de cada `FechamentoCargo` cujo fechamento não foi enviado até o
 * prazo.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processFechamentoAlertas();

  return NextResponse.json({ ok: true, ...result });
}
