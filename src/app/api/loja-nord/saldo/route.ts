import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { endOfMonth, startOfMonth, subMonths } from "date-fns";
import {
  getPontosGanhosTotal,
  getPontosNoPeriodo,
  getPontosPendentesAprovacao,
  getSaldoAtual,
} from "@/lib/loja-nord-server";
import { levelForPontos, nextLevelForPontos } from "@/lib/loja-nord";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const now = new Date();
  const inicioMes = startOfMonth(now);
  const fimMes = endOfMonth(now);
  const inicioMesAnterior = startOfMonth(subMonths(now, 1));
  const fimMesAnterior = endOfMonth(subMonths(now, 1));

  const [saldo, ganhosTotal, ganhosMes, ganhosMesAnterior, utilizadosMes, pendentes] = await Promise.all([
    getSaldoAtual(userId),
    getPontosGanhosTotal(userId),
    getPontosNoPeriodo(userId, inicioMes, fimMes, "positivo"),
    getPontosNoPeriodo(userId, inicioMesAnterior, fimMesAnterior, "positivo"),
    getPontosNoPeriodo(userId, inicioMes, fimMes, "negativo"),
    getPontosPendentesAprovacao(userId),
  ]);

  const nivel = levelForPontos(ganhosTotal);
  const proximoNivel = nextLevelForPontos(ganhosTotal);

  return NextResponse.json({
    saldo,
    ganhosTotal,
    ganhosMes,
    ganhosMesAnterior,
    utilizadosMes: Math.abs(utilizadosMes),
    pendentes,
    nivel,
    proximoNivel,
  });
}
