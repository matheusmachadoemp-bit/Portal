import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

const WEEKDAY_FIELDS = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"] as const;

function isValidHorario(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * Agenda de lembretes de contagem (dias da semana + horário + responsável/setor) — não cria a
 * `StockCount` automaticamente, só agenda a notificação disparada por
 * GET /api/estoque/contagens/lembretes/run (ver cron em vercel.json / GitHub Actions). Configuração
 * (gate `canEdit`), não dado operacional do dia a dia — por isso todos os verbos usam `canEdit`.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "estoque", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite configurar a agenda de contagens de estoque." },
      { status: 403 }
    );
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const schedules = await prisma.stockCountSchedule.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) } },
    orderBy: { createdAt: "desc" },
    include: { empresa: { select: { id: true, name: true, color: true } }, responsavel: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ schedules });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "estoque", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite configurar a agenda de contagens de estoque." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json({ error: "Selecione uma loja específica para criar um agendamento." }, { status: 400 });
  }

  const body = await req.json();
  const type = body.type === "MENSAL" ? "MENSAL" : "SEMANAL";

  if (!isValidHorario(body.horario)) {
    return NextResponse.json({ error: "Informe um horário válido (HH:mm)." }, { status: 400 });
  }

  if (body.responsavelId) {
    const responsavel = await prisma.user.findUnique({ where: { id: body.responsavelId }, select: { id: true } });
    if (!responsavel) return NextResponse.json({ error: "Responsável inválido." }, { status: 400 });
  }

  const weekdayData: Record<string, boolean> = {};
  for (const field of WEEKDAY_FIELDS) {
    if (body[field] !== undefined) weekdayData[field] = !!body[field];
  }

  const schedule = await prisma.stockCountSchedule.create({
    data: {
      empresaId: empresa.id,
      type,
      setor: body.setor || null,
      responsavelId: body.responsavelId || null,
      horario: body.horario,
      active: body.active !== undefined ? !!body.active : true,
      ...weekdayData,
    },
  });
  return NextResponse.json({ schedule });
}
