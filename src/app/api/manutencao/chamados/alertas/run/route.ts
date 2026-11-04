import { NextResponse } from "next/server";
import { isValidCronSecret } from "@/lib/cron-auth";
import { processChamadoAtrasoAlertas } from "@/lib/manutencao-server";

/**
 * Disparo agendado (Vercel Cron nativo, plano Pro, a cada 15 min — ver vercel.json, mesmo
 * padrão de checklist/escalations/run e fechamento-dia/alertas/run), autenticado via
 * CRON_SECRET. Antes do upgrade pro Pro, o Vercel Hobby só rodava 1x/dia e a cadência real de
 * poucos minutos vinha de um workflow redundante no GitHub Actions — removido depois do
 * upgrade, já que o Vercel Cron nativo passou a cobrir a mesma frequência direto. Ver
 * `processChamadoAtrasoAlertas` (@/lib/manutencao-server.ts)
 * para a lógica de negócio: notifica o responsável e o dono (ADMINISTRADOR) de cada `Chamado`
 * que passou do prazo e ainda não tinha sido avisado.
 */
export async function GET(req: Request) {
  // Comparação timing-safe (ver src/lib/cron-auth.ts) — achado do Jonas, auditoria de
  // segurança 2026-11: comparação de string simples (`===`) é vulnerável a timing attack.
  if (!(await isValidCronSecret(req.headers.get("authorization")))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processChamadoAtrasoAlertas();

  return NextResponse.json({ ok: true, ...result });
}
