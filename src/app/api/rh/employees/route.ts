import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { resolveEmployeeCargo, resolveEmployeeSetor } from "@/lib/rh-server";

const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export async function GET() {
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

  const employees = await prisma.employee.findMany({
    where: { empresaId: { in: empresaIdsForContext(ctx) } },
    orderBy: { name: "asc" },
    include: { empresa: { select: { name: true } } },
  });
  return NextResponse.json({ employees });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite cadastrar colaboradores." },
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

  if (!body.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 });
  }

  // Cargo/Setor passam pelo catálogo de RH (EmployeeCargo/EmployeeSetor) em vez de gravar o texto
  // solto: reaproveita o item já cadastrado quando o texto bate, ou cadastra um item novo na hora
  // quando não bate com nenhum — nunca aceita/rejeita sem passar por essa checagem (ver
  // @/lib/rh-server para o racional completo). Mesmo texto normalizado (trim) é o que acaba
  // gravado em `Employee.cargo`/`.setor`.
  const cargoResolvido = await resolveEmployeeCargo(empresa.id, body.cargo);
  if (!cargoResolvido.ok) return NextResponse.json({ error: cargoResolvido.error }, { status: 400 });
  const setorResolvido = await resolveEmployeeSetor(empresa.id, body.setor);
  if (!setorResolvido.ok) return NextResponse.json({ error: setorResolvido.error }, { status: 400 });

  const employee = await prisma.employee.create({
    data: {
      empresaId: empresa.id,
      name: body.name,
      cargo: cargoResolvido.nome,
      setor: setorResolvido.nome,
      admissionDate: new Date(body.admissionDate),
      terminationDate: body.terminationDate ? new Date(body.terminationDate) : null,
      status: body.status || "ATIVO",
      phone: body.phone || null,
      email: body.email || null,
      cpf: body.cpf || null,
      pixKey: body.pixKey || null,
      birthDate: body.birthDate ? new Date(body.birthDate) : null,
      escala: body.escala || null,
      gestorResponsavel: body.gestorResponsavel || null,
      supervisorResponsavel: body.supervisorResponsavel || null,
      salarioFixo: body.salarioFixo ? Number(body.salarioFixo) : null,
      lastEvaluationDate: body.lastEvaluationDate ? new Date(body.lastEvaluationDate) : null,
      lastEvaluationNote: body.lastEvaluationNote || null,
      lastTrainingDate: body.lastTrainingDate ? new Date(body.lastTrainingDate) : null,
      lastTrainingName: body.lastTrainingName || null,
    },
  });

  return NextResponse.json({ employee });
}
