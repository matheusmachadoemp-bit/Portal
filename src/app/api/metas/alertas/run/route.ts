import { NextResponse } from "next/server";
import { isValidCronSecret } from "@/lib/cron-auth";
import { processGoalAlerts } from "@/lib/goals-server";

/** Disparo agendado (Vercel Cron, ver vercel.json), autenticado via CRON_SECRET. */
export async function GET(req: Request) {
  // Comparação timing-safe (ver src/lib/cron-auth.ts) — achado do Jonas, auditoria de
  // segurança 2026-11: comparação de string simples (`===`) é vulnerável a timing attack.
  if (!(await isValidCronSecret(req.headers.get("authorization")))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processGoalAlerts();

  return NextResponse.json({ ok: true, ...result });
}
