import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { computeHorasTrabalhadas } from "@/lib/rh-helpers";
import { hasModulePermission } from "@/lib/authz";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const employeeId = searchParams.get("employeeId");

  const entries = await prisma.timeEntry.findMany({
    where: {
      empresaId: { in: empresaIdsForContext(ctx) },
      ...(employeeId ? { employeeId } : {}),
    },
    orderBy: { date: "desc" },
    take: 500,
    include: { employee: { select: { name: true, setor: true } } },
  });
  return NextResponse.json({ entries });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // O upsert abaixo (create/update por employeeId+date) é só uma proteção contra duplicidade —
  // no fluxo da tela (ponto-eletronico-client.tsx) este POST só é chamado para lançar um registro
  // novo; editar um já existente vai sempre pela rota PATCH em [id]. Por isso trata como canCreate.
  if (!(await hasModulePermission(session.user.id, "rh", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite lançar registros de ponto." },
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

  const body = await req.json();
  const employee = await prisma.employee.findUnique({ where: { id: body.employeeId } });
  if (!employee || employee.empresaId !== empresa.id) {
    return NextResponse.json({ error: "Colaborador inválido para a loja ativa." }, { status: 400 });
  }

  const horasTrabalhadas = computeHorasTrabalhadas({
    entrada: body.entrada,
    saidaAlmoco: body.saidaAlmoco,
    retornoAlmoco: body.retornoAlmoco,
    saida: body.saida,
  });

  const entry = await prisma.timeEntry.upsert({
    where: { employeeId_date: { employeeId: body.employeeId, date: new Date(body.date) } },
    create: {
      employeeId: body.employeeId,
      empresaId: empresa.id,
      date: new Date(body.date),
      entrada: body.entrada || null,
      saidaAlmoco: body.saidaAlmoco || null,
      retornoAlmoco: body.retornoAlmoco || null,
      saida: body.saida || null,
      horasTrabalhadas,
      atrasoMinutos: Number(body.atrasoMinutos) || 0,
      falta: !!body.falta,
    },
    update: {
      entrada: body.entrada || null,
      saidaAlmoco: body.saidaAlmoco || null,
      retornoAlmoco: body.retornoAlmoco || null,
      saida: body.saida || null,
      horasTrabalhadas,
      atrasoMinutos: Number(body.atrasoMinutos) || 0,
      falta: !!body.falta,
    },
  });

  return NextResponse.json({ entry });
}
