import { NextResponse } from "next/server";
import { isValidCronSecret } from "@/lib/cron-auth";
import { recalcularAdicionalNoturnoCompetencia } from "@/lib/adicional-noturno";
import { spDateKey } from "@/lib/timezone";

/**
 * Disparo agendado (Vercel Cron, ver `vercel.json`, todo dia 2 do mês) que calcula/upserta o
 * Adicional Noturno (`NightShiftAllowance`, status `PENDENTE`) de todos os colaboradores
 * elegíveis da competência que ACABOU de fechar (mês anterior ao dia em que o cron roda) —
 * ver `src/lib/adicional-noturno.ts` para o motor de cálculo e o racional de elegibilidade.
 *
 * Autenticado via `CRON_SECRET` com comparação timing-safe (`src/lib/cron-auth.ts`), mesmo
 * padrão já usado pelos demais crons do projeto (achado do Jonas, auditoria de segurança
 * 2026-11).
 */
export async function GET(req: Request) {
  if (!(await isValidCronSecret(req.headers.get("authorization")))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // "Hoje" no fuso de São Paulo (não UTC) — o cron roda no dia 2, mas o servidor pode estar em
  // qualquer fuso; usar o dia de São Paulo evita fechar a competência errada perto da virada do
  // mês (ex.: UTC já em dia 2 às 21h de São Paulo do dia 1).
  const hoje = spDateKey();
  const [anoAtual, mesAtual] = hoje.split("-").map(Number);
  const competenciaMes = mesAtual === 1 ? 12 : mesAtual - 1;
  const competenciaAno = mesAtual === 1 ? anoAtual - 1 : anoAtual;

  const resultado = await recalcularAdicionalNoturnoCompetencia(competenciaMes, competenciaAno);

  return NextResponse.json({ ok: true, competenciaMes, competenciaAno, ...resultado });
}
