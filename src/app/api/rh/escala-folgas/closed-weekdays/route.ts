import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/**
 * Dias fixos de loja fechada (`StoreClosedWeekday`) da loja ativa — sempre devolve as 7 linhas
 * (0=domingo..6=sábado, mesmo vocabulário de `spWeekday`/`ProductionWeekdayWeight`), com
 * `ativo: false` para dias sem configuração cadastrada ainda (nunca precisa existir uma linha
 * pra cada dia de antemão — só nasce quando um dia é marcado como fechado).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "rh", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver o RH." }, { status: 403 });
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx || ctx.mode !== "single") {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível configurar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const rows = await prisma.storeClosedWeekday.findMany({ where: { empresaId: ctx.empresa.id } });
  const byWeekday = new Map(rows.map((r) => [r.weekday, r]));
  const closedWeekdays = WEEKDAY_LABELS.map((label, weekday) => ({
    weekday,
    label,
    ativo: byWeekday.get(weekday)?.ativo ?? false,
  }));
  return NextResponse.json({ closedWeekdays });
}

/** Liga/desliga UM dia da semana como "loja fechada" (upsert por `weekday`) na loja ativa. */
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "rh", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite configurar dias de loja fechada." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível configurar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  const weekday = Number(body?.weekday);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return NextResponse.json({ error: "Informe um dia da semana válido (0 a 6)." }, { status: 400 });
  }
  const ativo = body?.ativo === true;

  const closedWeekday = await prisma.storeClosedWeekday.upsert({
    where: { empresaId_weekday: { empresaId: empresa.id, weekday } },
    update: { ativo },
    create: { empresaId: empresa.id, weekday, ativo },
  });
  return NextResponse.json({ closedWeekday });
}
