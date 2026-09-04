import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CHECKLIST_TERMINAL_STATUSES, spDateKey, spStartOfDay } from "@/lib/checklist";
import { generateChecklistOccurrences, processChecklistEscalations, refreshOccurrenceStatuses } from "@/lib/checklist-server";

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

  const day = spStartOfDay(dateKey);
  const pending = await prisma.checklistOccurrence.findMany({
    where: { empresaId: { in: empresaIds }, date: day, status: { notIn: CHECKLIST_TERMINAL_STATUSES } },
    select: { id: true },
  });
  const ids = pending.map((o) => o.id);

  await refreshOccurrenceStatuses(ids);
  const result = await processChecklistEscalations(ids);

  return NextResponse.json({ ok: true, checked: ids.length, notified: result.notified });
}
