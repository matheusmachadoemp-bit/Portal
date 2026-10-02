import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { resolveEmployeeCargo, resolveEmployeeSetor } from "@/lib/rh-server";
import { isValidBlobUrl } from "@/lib/manutencao-server";
import { spStartOfDay } from "@/lib/timezone";

const MANAGER_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE", "SUPERVISOR"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar colaboradores." },
      { status: 403 }
    );
  }
  const body = await req.json();

  if (body.photoUrl && !isValidBlobUrl(body.photoUrl)) {
    return NextResponse.json({ error: "URL de arquivo inválida." }, { status: 400 });
  }

  // Contato de emergência é obrigatório (mesma regra do POST — ver racional lá), mas só checamos
  // quando o campo foi de fato enviado no corpo (`!== undefined`): este PATCH também é chamado com
  // um corpo parcial contendo só `{ photoUrl }` pela troca rápida de foto (handlePhotoChange em
  // colaboradores-client.tsx / employee-profile-client.tsx), que não deve ser bloqueada por esta
  // validação. O formulário de edição completo sempre manda os dois campos (ficaram `required` no
  // HTML), então na prática só dispara se o campo for enviado vazio.
  if (body.emergencyContactName !== undefined && (!body.emergencyContactName || !String(body.emergencyContactName).trim())) {
    return NextResponse.json({ error: "Nome do contato de emergência é obrigatório." }, { status: 400 });
  }
  if (body.emergencyContactPhone !== undefined && (!body.emergencyContactPhone || !String(body.emergencyContactPhone).trim())) {
    return NextResponse.json({ error: "Telefone do contato de emergência é obrigatório." }, { status: 400 });
  }

  // Mesmo catálogo de RH (EmployeeCargo/EmployeeSetor) da criação (ver @/lib/rh-server) — só
  // resolve/cadastra quando o campo foi de fato enviado no PATCH (`undefined` continua
  // significando "não mexe neste campo", mesmo critério já usado pelos demais campos desta
  // rota); usa a empresa do colaborador já existente, não a empresa ativa da sessão (o usuário
  // pode estar editando alguém de uma loja específica com o seletor do Portal em modo "Grupo
  // Nord" — mesmo raciocínio de `assertEmpresaAccess(..., existing.empresaId)` logo acima).
  let cargoResolvido: string | undefined;
  if (body.cargo !== undefined) {
    const resultado = await resolveEmployeeCargo(existing.empresaId, body.cargo);
    if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: 400 });
    cargoResolvido = resultado.nome;
  }
  let setorResolvido: string | undefined;
  if (body.setor !== undefined) {
    const resultado = await resolveEmployeeSetor(existing.empresaId, body.setor);
    if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: 400 });
    setorResolvido = resultado.nome;
  }

  const employee = await prisma.employee.update({
    where: { id },
    data: {
      name: body.name ?? undefined,
      cargo: cargoResolvido,
      setor: setorResolvido,
      photoUrl: body.photoUrl !== undefined ? (body.photoUrl ? String(body.photoUrl) : null) : undefined,
      admissionDate: body.admissionDate ? spStartOfDay(body.admissionDate) : undefined,
      terminationDate: body.terminationDate ? spStartOfDay(body.terminationDate) : body.terminationDate === null ? null : undefined,
      status: body.status ?? undefined,
      phone: body.phone ?? undefined,
      email: body.email ?? undefined,
      cpf: body.cpf ?? undefined,
      pixKey: body.pixKey ?? undefined,
      birthDate: body.birthDate !== undefined ? (body.birthDate ? spStartOfDay(body.birthDate) : null) : undefined,
      escala: body.escala ?? undefined,
      gestorResponsavel: body.gestorResponsavel ?? undefined,
      supervisorResponsavel: body.supervisorResponsavel ?? undefined,
      salarioFixo: body.salarioFixo !== undefined ? (body.salarioFixo ? Number(body.salarioFixo) : null) : undefined,
      lastEvaluationDate:
        body.lastEvaluationDate !== undefined ? (body.lastEvaluationDate ? spStartOfDay(body.lastEvaluationDate) : null) : undefined,
      lastEvaluationNote: body.lastEvaluationNote ?? undefined,
      lastTrainingDate:
        body.lastTrainingDate !== undefined ? (body.lastTrainingDate ? spStartOfDay(body.lastTrainingDate) : null) : undefined,
      lastTrainingName: body.lastTrainingName ?? undefined,
      emergencyContactName: body.emergencyContactName ?? undefined,
      emergencyContactPhone: body.emergencyContactPhone ?? undefined,
    },
  });

  return NextResponse.json({ employee });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "rh", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir colaboradores." },
      { status: 403 }
    );
  }
  await prisma.employee.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
