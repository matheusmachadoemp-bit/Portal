import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

// BUG-004b: mesma checagem de cargo já usada nas rotas irmãs `/api/rh/employees` e
// `/api/rh/finance` (desde o commit f109b8e) — sem ela, qualquer COLABORADOR com o Perfil de
// Permissão padrão "Funcionário" (rh:canView=true de fábrica) conseguia chamar este GET direto
// (fora da tela, que já foi corrigida no BUG-004) e listar as ocorrências disciplinares de todos
// os colegas.
const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canView"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite ver o RH." },
      { status: 403 }
    );
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const employeeId = searchParams.get("employeeId");

  const occurrences = await prisma.occurrence.findMany({
    where: {
      employee: { empresaId: { in: empresaIdsForContext(ctx) } },
      ...(employeeId ? { employeeId } : {}),
    },
    orderBy: { date: "desc" },
    take: 300,
    include: { employee: { select: { name: true, setor: true } }, createdBy: { select: { name: true } } },
  });
  return NextResponse.json({ occurrences });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "rh", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite registrar ocorrências." },
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

  const occurrence = await prisma.occurrence.create({
    data: {
      employeeId: body.employeeId,
      date: new Date(body.date),
      type: body.type,
      horarioPrevisto: body.horarioPrevisto || null,
      horarioRealizado: body.horarioRealizado || null,
      minutosAtraso: Number(body.minutosAtraso) || 0,
      justificativa: body.justificativa || null,
      medidasTomadas: body.medidasTomadas || null,
      prazo: body.prazo ? new Date(body.prazo) : null,
      anexoUrl: body.anexoUrl || null,
      observacao: body.observacao || null,
      status: body.status || "PENDENTE",
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ occurrence });
}
