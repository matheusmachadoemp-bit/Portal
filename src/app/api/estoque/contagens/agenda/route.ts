import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import {
  empresaIdsForContext,
  findUsersWithoutEmpresaAccess,
  getActiveEmpresaContext,
  requireActiveSingleEmpresa,
} from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

const WEEKDAY_FIELDS = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"] as const;

function isValidHorario(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * Agenda de contagem (dias da semana + horário + responsável/setor + horário-limite opcional) —
 * a mesma recorrência gera a `StockCount` do dia (`generateStockCounts`) e agenda a notificação,
 * ambas disparadas por GET /api/estoque/contagens/lembretes/run (ver cron em vercel.json, a cada 15 min via Vercel
 * Cron nativo). Configuração (gate `canEdit`), não dado operacional do dia a dia — por isso
 * todos os verbos usam `canEdit`.
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
  if (body.horarioLimite !== undefined && body.horarioLimite !== null && body.horarioLimite !== "" && !isValidHorario(body.horarioLimite)) {
    return NextResponse.json({ error: "Informe um horário-limite válido (HH:mm)." }, { status: 400 });
  }

  if (body.responsavelId) {
    const responsavel = await prisma.user.findUnique({ where: { id: body.responsavelId }, select: { id: true } });
    if (!responsavel) return NextResponse.json({ error: "Responsável inválido." }, { status: 400 });
    // Sem essa checagem, um usuário com acesso só a OUTRA loja podia ser configurado como
    // responsável pelo lembrete — e passaria a receber, todo dia no horário agendado, uma
    // notificação de uma tarefa de uma loja à qual não tem acesso nenhum. Mesmo padrão já
    // usado em outras rotas que gravam um id de usuário vindo do corpo da requisição (ver
    // comentário de `findUsersWithoutEmpresaAccess` em src/lib/empresa.ts).
    const invalidIds = await findUsersWithoutEmpresaAccess([body.responsavelId], empresa.id);
    if (invalidIds.length > 0) {
      return NextResponse.json({ error: "Esse responsável não tem acesso a esta loja." }, { status: 400 });
    }
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
      horarioLimite: body.horarioLimite || null,
      active: body.active !== undefined ? !!body.active : true,
      ...weekdayData,
    },
  });
  return NextResponse.json({ schedule });
}
