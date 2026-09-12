import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * "Ping" para manter o banco (Neon, plano Free) acordado — o autosuspend do
 * Neon desliga o compute depois de alguns minutos sem uso, e a próxima
 * consulta real do usuário paga o custo de "acordar" o banco (vários
 * segundos). Disparado por um workflow do GitHub Actions a cada poucos
 * minutos (o Vercel Cron do plano Hobby só permite 1 execução por dia,
 * então não serve para esse propósito), autenticado via CRON_SECRET —
 * mesmo padrão das demais rotas de cron do projeto.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.$queryRaw`SELECT 1`;

  return NextResponse.json({ ok: true, timestamp: new Date().toISOString() });
}
