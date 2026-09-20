import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { spStartOfDay } from "@/lib/checklist";
import { evaluateSectorCoverage, resolveOwnSetor, resolveSchedulePeriod } from "@/lib/escala-folgas-server";
import { parseDateKeyInput } from "@/lib/escala-folgas";

const ENTRY_INCLUDE = {
  employee: { select: { id: true, name: true, setor: true, cargo: true, photoUrl: true } },
  dayOffType: { select: { id: true, key: true, nome: true, cor: true, kind: true } },
  createdBy: { select: { name: true } },
  autorizadoPor: { select: { name: true } },
} satisfies Prisma.DayOffEntryInclude;

/**
 * Folgas cadastradas (`DayOffEntry`) — só isso, NÃO é ainda "o calendário completo". Filtros por
 * query: `employeeId`, `setor`, `cargo`, `dayOffTypeId`, `from`/`to` (mesmo padrão "from"/"to" já
 * usado em `GET /api/rh/time-entries`).
 *
 * Pendência sinalizada na revisão do Teulis (decisão de sequenciamento do líder pra Fase 2, não
 * resolvida aqui): esta rota NÃO junta Férias (`Vacation`)/Afastamento (`Absence`)/Loja fechada
 * (`StoreClosedWeekday`) no resultado — só `DayOffEntry` mesmo. Quem for montar a tela de
 * calendário ainda precisa combinar as 4 fontes (ver nota maior em
 * `listIndisponiveisNoSetor`, @/lib/escala-folgas-server) — provavelmente um endpoint novo, não
 * esta rota.
 *
 * Líder (Role SUPERVISOR) só enxerga o próprio setor aqui (item 16 do pedido original: "Líder
 * vê... do próprio setor", diferente de Gerente/Administrador, que veem a loja inteira) — o
 * `setor` da query é ignorado nesse caso, nunca confia no valor vindo do cliente.
 *
 * Esta rota NÃO filtra ainda por `SchedulePeriod.status` (RASCUNHO x PUBLICADA) — a regra
 * "colaborador só vê mês já publicado" é implementada na fase que introduz o botão "Publicar
 * escala" (Fase 3), que é quando published/draft passa a ter efeito de verdade pela primeira vez.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "rh", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver o RH." }, { status: 403 });
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const employeeId = searchParams.get("employeeId");
  const cargo = searchParams.get("cargo");
  const dayOffTypeId = searchParams.get("dayOffTypeId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let setor = searchParams.get("setor");
  if (session.user.role === "SUPERVISOR") {
    const ownSetor = await resolveOwnSetor(session.user.id);
    if (!ownSetor) return NextResponse.json({ entries: [] });
    setor = ownSetor;
  }

  const entries = await prisma.dayOffEntry.findMany({
    where: {
      empresaId: { in: empresaIdsForContext(ctx) },
      ...(employeeId ? { employeeId } : {}),
      ...(dayOffTypeId ? { dayOffTypeId } : {}),
      // `DayOffEntry.date` é sempre gravado em `spStartOfDay(dateKey)` (meia-noite de São Paulo,
      // que é 03:00 UTC do MESMO dia) — comparar contra `new Date(from/to)` (meia-noite UTC crua,
      // 3h ANTES disso) cortava justamente o registro do dia `to` inteiro fora do resultado (achado
      // da revisão do Teulis). `spStartOfDay` em vez de `new Date` alinha o filtro com o jeito real
      // que a data é gravada.
      ...(from || to
        ? { date: { ...(from ? { gte: spStartOfDay(from) } : {}), ...(to ? { lte: spStartOfDay(to) } : {}) } }
        : {}),
      ...(setor || cargo
        ? { employee: { ...(setor ? { setor } : {}), ...(cargo ? { cargo } : {}) } }
        : {}),
    },
    orderBy: { date: "asc" },
    take: 1000,
    include: ENTRY_INCLUDE,
  });
  return NextResponse.json({ entries });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "rh", "canCreate"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite cadastrar folgas." }, { status: 403 });
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível cadastrar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  const employeeId = typeof body?.employeeId === "string" ? body.employeeId : "";
  const dayOffTypeId = typeof body?.dayOffTypeId === "string" ? body.dayOffTypeId : "";
  // `date` chega como "YYYY-MM-DD" pronto (data escolhida no calendário) — usado direto como
  // dateKey, nunca reconvertido via `spDateKey(new Date(...))` (ver `parseDateKeyInput`).
  const dateKey = parseDateKeyInput(body?.date);
  if (!employeeId || !dateKey || !dayOffTypeId) {
    return NextResponse.json({ error: "Informe colaborador, data (AAAA-MM-DD) e tipo de folga." }, { status: 400 });
  }

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.empresaId !== empresa.id) {
    return NextResponse.json({ error: "Colaborador inválido para a loja ativa." }, { status: 400 });
  }
  if (employee.status !== "ATIVO") {
    return NextResponse.json({ error: "Só é possível cadastrar folga para colaborador ativo." }, { status: 400 });
  }

  // Líder só cadastra pro próprio setor (item 16) — Gerente/Administrador cadastram pra qualquer
  // setor da loja.
  if (session.user.role === "SUPERVISOR") {
    const ownSetor = await resolveOwnSetor(session.user.id);
    if (!ownSetor || ownSetor !== employee.setor) {
      return NextResponse.json(
        { error: "Você só pode cadastrar folga para colaboradores do seu próprio setor." },
        { status: 403 }
      );
    }
  }

  const dayOffType = await prisma.dayOffType.findUnique({ where: { id: dayOffTypeId } });
  if (!dayOffType || !dayOffType.ativo) {
    return NextResponse.json({ error: "Tipo de folga inválido." }, { status: 400 });
  }
  if (dayOffType.kind !== "FOLGA") {
    return NextResponse.json(
      {
        error:
          dayOffType.kind === "FERIAS"
            ? "Férias são cadastradas em RH > Férias, não por aqui — o calendário da Escala de Folgas já lê de lá automaticamente."
            : "Afastamentos são cadastrados pela rotina própria de Afastamentos (POST /api/rh/absences), não por aqui — o calendário da Escala de Folgas já lê de lá automaticamente.",
      },
      { status: 400 }
    );
  }

  const coverage = await evaluateSectorCoverage({ empresaId: empresa.id, setor: employee.setor, employeeId, dateKey });
  const confirmarApesarDoAviso = body?.confirmarApesarDoAviso === true;
  if (coverage?.insuficiente && !confirmarApesarDoAviso) {
    // Aviso, nunca bloqueio (item 5 do pedido original): devolve os números pro cliente decidir
    // se confirma, sem gravar nada ainda.
    return NextResponse.json({ saved: false, coverage });
  }

  const schedulePeriod = await resolveSchedulePeriod(empresa.id, dateKey);

  try {
    const dayOffEntry = await prisma.dayOffEntry.create({
      data: {
        empresaId: empresa.id,
        employeeId,
        schedulePeriodId: schedulePeriod.id,
        dayOffTypeId,
        date: spStartOfDay(dateKey),
        observacao: typeof body?.observacao === "string" ? body.observacao.trim() || null : null,
        autorizadoPorId: coverage?.insuficiente ? session.user.id : null,
        autorizadoEm: coverage?.insuficiente ? new Date() : null,
        createdById: session.user.id,
      },
      include: ENTRY_INCLUDE,
    });
    return NextResponse.json({ dayOffEntry, saved: true, coverage }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "Esse colaborador já tem uma folga cadastrada nesse dia. Edite a folga existente em vez de criar outra." },
        { status: 409 }
      );
    }
    throw e;
  }
}
