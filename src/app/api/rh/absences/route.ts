import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { spStartOfDay } from "@/lib/checklist";
import { parseDateKeyInput } from "@/lib/escala-folgas";

/**
 * Afastamentos (`Absence`) — mesmo desenho/rota de `/api/rh/vacations` (ver comentário no bloco
 * "RH — AFASTAMENTOS" em `prisma/schema.prisma`). A Escala de Folgas lê daqui pro calendário
 * (tipo "Afastamento"), sem duplicar em `DayOffEntry`.
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

  const absences = await prisma.absence.findMany({
    where: {
      empresaId: { in: empresaIdsForContext(ctx) },
      ...(employeeId ? { employeeId } : {}),
    },
    orderBy: { dataInicio: "desc" },
    include: { employee: { select: { name: true, setor: true } } },
  });
  return NextResponse.json({ absences });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "rh", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite cadastrar afastamentos." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível cadastrar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  // "YYYY-MM-DD" pronto, gravado com `spStartOfDay` — nunca `new Date(raw)` cru (meia-noite UTC),
  // pro campo ficar na mesma convenção de `DayOffEntry.date` (mesma família do bug de fuso já
  // corrigido nesta tarefa; ver `parseDateKeyInput`/`utcDayBounds` em @/lib/escala-folgas).
  const dataInicioKey = parseDateKeyInput(body?.dataInicio);
  if (!body?.employeeId || !dataInicioKey) {
    return NextResponse.json({ error: "Informe colaborador e data de início (AAAA-MM-DD)." }, { status: 400 });
  }
  let dataFimKey: string | null = null;
  if (body?.dataFim) {
    dataFimKey = parseDateKeyInput(body.dataFim);
    if (!dataFimKey) return NextResponse.json({ error: "Data de fim inválida. Use o formato AAAA-MM-DD." }, { status: 400 });
  }
  const employee = await prisma.employee.findUnique({ where: { id: body.employeeId } });
  if (!employee || employee.empresaId !== empresa.id) {
    return NextResponse.json({ error: "Colaborador inválido para a loja ativa." }, { status: 400 });
  }

  const absence = await prisma.absence.create({
    data: {
      employeeId: body.employeeId,
      empresaId: empresa.id,
      dataInicio: spStartOfDay(dataInicioKey),
      dataFim: dataFimKey ? spStartOfDay(dataFimKey) : null,
      motivo: body.motivo || null,
      status: body.status || "PLANEJADO",
      observacao: body.observacao || null,
      createdById: session.user.id,
    },
  });
  return NextResponse.json({ absence }, { status: 201 });
}
