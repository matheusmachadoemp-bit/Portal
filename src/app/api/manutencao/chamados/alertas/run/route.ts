import { NextResponse } from "next/server";
import { processChamadoAtrasoAlertas } from "@/lib/manutencao-server";

/**
 * Disparo agendado (GitHub Actions a cada poucos minutos, ver
 * .github/workflows/manutencao-chamados-atrasados.yml, mais o Vercel Cron diário como reforço,
 * ver vercel.json — mesmo padrão de checklist/escalations/run e fechamento-dia/alertas/run),
 * autenticado via CRON_SECRET. Ver `processChamadoAtrasoAlertas` (@/lib/manutencao-server.ts)
 * para a lógica de negócio: notifica o responsável e o dono (ADMINISTRADOR) de cada `Chamado`
 * que passou do prazo e ainda não tinha sido avisado.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processChamadoAtrasoAlertas();

  return NextResponse.json({ ok: true, ...result });
}
