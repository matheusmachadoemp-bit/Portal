import { NextResponse } from "next/server";
import { processGoalAlerts } from "@/lib/goals-server";

/** Disparo agendado (Vercel Cron, ver vercel.json), autenticado via CRON_SECRET. */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processGoalAlerts();

  return NextResponse.json({ ok: true, ...result });
}
