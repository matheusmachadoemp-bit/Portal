import { NextResponse } from "next/server";
import { processOrcamentosExpirados } from "@/lib/manutencao-server";

/**
 * Disparo agendado (Vercel Cron nativo, ver vercel.json), autenticado via CRON_SECRET — mesmo
 * padrão de manutencao/chamados/alertas/run e demais crons do projeto. Ver
 * `processOrcamentosExpirados` (@/lib/manutencao-server.ts) para a lógica de negócio: marca como
 * `EXPIRADO` todo `Orcamento` que ficou muitos dias sem decisão (RECEBIDO/EM_ANALISE).
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processOrcamentosExpirados();

  return NextResponse.json({ ok: true, ...result });
}
