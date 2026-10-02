import { NextResponse } from "next/server";
import { processFechamentoAlertas } from "@/lib/fechamento-server";

/**
 * Disparo agendado (Vercel Cron nativo, plano Pro, a cada 5 min — ver vercel.json), autenticado
 * via CRON_SECRET. Antes do upgrade pro Pro, o Vercel Hobby só rodava este cron 1x/dia (pouco
 * depois da meia-noite de São Paulo, já com o prazo de "ontem" vencido) e a cadência real de
 * poucos minutos vinha de um workflow redundante no GitHub Actions — removido depois do upgrade,
 * já que o Vercel Cron nativo passou a cobrir a mesma frequência direto. Ver
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
