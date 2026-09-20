import { NextResponse } from "next/server";
import { subDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { CHECKLIST_TERMINAL_STATUSES, spDateKey, spStartOfDay } from "@/lib/checklist";
import { generateChecklistOccurrences, processChecklistEscalations, refreshOccurrenceStatuses } from "@/lib/checklist-server";

/**
 * Quantos dias antes de hoje essa rota também revisita em busca de
 * ocorrências presas num status não-terminal (na prática, ATRASADO). Sem
 * isso, uma ocorrência só é revisitada enquanto `date` é hoje — se o cron
 * (GitHub Actions a cada 5 min, ver .github/workflows/checklist-escalations.yml,
 * mais o reforço diário do Vercel, ver vercel.json) ficar indisponível bem
 * na janela em que ela cruza o limiar de atraso, ela nunca mais seria
 * revisitada (o dia seguinte já filtra só `date: hoje`) e ficaria presa em
 * ATRASADO pra sempre, sem nunca virar NAO_REALIZADO nem gerar a cobrança
 * correspondente.
 *
 * 7 dias cobre uma indisponibilidade bem acima do razoável pro cron (feriado
 * prolongado, secret expirado por alguns dias etc.) sem deixar a consulta
 * crescer sem limite conforme o histórico envelhece — depois desse prazo,
 * uma ocorrência atrasada de dias atrás deixa de ser algo que ainda faz
 * sentido cobrar automaticamente (nesse ponto o problema já teria que ter
 * sido notado de outra forma).
 */
const ESCALATION_LOOKBACK_DAYS = 7;

/** Disparo agendado (Vercel Cron, ver vercel.json), autenticado via CRON_SECRET. */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const empresas = await prisma.empresa.findMany({ where: { active: true }, select: { id: true } });
  const empresaIds = empresas.map((e) => e.id);
  const dateKey = spDateKey();

  await generateChecklistOccurrences(empresaIds, dateKey);

  // `date: { gte: since, lte: day }` em vez de `date: day` — cobre hoje E os
  // `ESCALATION_LOOKBACK_DAYS` dias anteriores, pra revisitar ocorrências
  // atrasadas que uma indisponibilidade do cron deixou passar (ver comentário
  // de ESCALATION_LOOKBACK_DAYS acima). `refreshOccurrenceStatuses` +
  // `processChecklistEscalations` seguem idênticos pro conjunto maior de
  // ocorrências — a idempotência de `ChecklistEscalationLog` garante que
  // revisitar um dia já processado antes nunca duplica notificação.
  const day = spStartOfDay(dateKey);
  const since = subDays(day, ESCALATION_LOOKBACK_DAYS);
  const pending = await prisma.checklistOccurrence.findMany({
    where: { empresaId: { in: empresaIds }, date: { gte: since, lte: day }, status: { notIn: CHECKLIST_TERMINAL_STATUSES } },
    select: { id: true },
  });
  const ids = pending.map((o) => o.id);

  await refreshOccurrenceStatuses(ids);
  const result = await processChecklistEscalations(ids);

  return NextResponse.json({ ok: true, checked: ids.length, notified: result.notified });
}
