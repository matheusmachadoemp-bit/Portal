import { NextResponse } from "next/server";
import { isValidCronSecret } from "@/lib/cron-auth";
import { processOrcamentosExpirados } from "@/lib/manutencao-server";

/**
 * Disparo agendado (Vercel Cron nativo, ver vercel.json), autenticado via CRON_SECRET — mesmo
 * padrão de manutencao/chamados/alertas/run e demais crons do projeto. Ver
 * `processOrcamentosExpirados` (@/lib/manutencao-server.ts) para a lógica de negócio: marca como
 * `EXPIRADO` todo `Orcamento` que ficou muitos dias sem decisão (RECEBIDO/EM_ANALISE).
 */
export async function GET(req: Request) {
  // Comparação timing-safe (ver src/lib/cron-auth.ts) — achado do Jonas, auditoria de
  // segurança 2026-11: comparação de string simples (`===`) é vulnerável a timing attack.
  if (!(await isValidCronSecret(req.headers.get("authorization")))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processOrcamentosExpirados();

  return NextResponse.json({ ok: true, ...result });
}
