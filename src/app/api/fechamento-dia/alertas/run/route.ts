import { NextResponse } from "next/server";
import { isValidCronSecret } from "@/lib/cron-auth";
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
  // Comparação timing-safe (ver src/lib/cron-auth.ts) — achado do Jonas, auditoria de
  // segurança 2026-11: comparação de string simples (`===`) é vulnerável a timing attack.
  if (!(await isValidCronSecret(req.headers.get("authorization")))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processFechamentoAlertas();

  return NextResponse.json({ ok: true, ...result });
}
