import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { generateChecklistOccurrences, refreshOccurrenceStatuses } from "@/lib/checklist-server";
import { spDateKey, spStartOfDay } from "@/lib/checklist";

const OCCURRENCE_INCLUDE = {
  template: {
    select: {
      id: true,
      name: true,
      setor: true,
      turno: true,
      fotoChecklist: true,
      empresa: { select: { id: true, name: true } },
    },
  },
  responsavel: { select: { id: true, name: true } },
};

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const empresaIds = empresaIdsForContext(ctx);
  const { searchParams } = new URL(req.url);
  const dateKey = searchParams.get("date") || spDateKey();

  await generateChecklistOccurrences(empresaIds, dateKey);

  const day = spStartOfDay(dateKey);
  const existing = await prisma.checklistOccurrence.findMany({
    where: { empresaId: { in: empresaIds }, date: day },
    select: { id: true },
  });
  await refreshOccurrenceStatuses(existing.map((o) => o.id));

  const occurrences = await prisma.checklistOccurrence.findMany({
    where: { empresaId: { in: empresaIds }, date: day },
    include: OCCURRENCE_INCLUDE,
    orderBy: { dueAt: "asc" },
  });

  return NextResponse.json({ occurrences, date: dateKey });
}
