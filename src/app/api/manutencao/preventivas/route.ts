import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import {
  assertEmpresaAccess,
  empresaIdsForContext,
  findUsersWithoutEmpresaAccess,
  getActiveEmpresaContext,
} from "@/lib/empresa";
import { MANAGER_ROLES } from "@/lib/manutencao-server";
import { hasModulePermission } from "@/lib/authz";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "manutencao", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver a Manutenção." }, { status: 403 });
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const { searchParams } = new URL(req.url);
  const equipamentoId = searchParams.get("equipamentoId");

  const preventivas = await prisma.manutencaoPreventiva.findMany({
    where: {
      equipamento: { empresaId: { in: empresaIds } },
      ...(equipamentoId ? { equipamentoId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      equipamento: { select: { id: true, nome: true, codigo: true, setor: true, empresa: { select: { name: true, color: true } } } },
      responsavel: { select: { id: true, name: true } },
      prestador: { select: { id: true, nome: true } },
    },
  });

  return NextResponse.json({ preventivas });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode programar manutenções preventivas." }, { status: 403 });
  }

  const body = await req.json();
  if (!body.equipamentoId || !body.tipoServico || !body.dataInicio) {
    return NextResponse.json({ error: "Equipamento, tipo de serviço e data de início são obrigatórios." }, { status: 400 });
  }

  const equipamento = await prisma.equipamento.findUnique({ where: { id: body.equipamentoId } });
  if (!equipamento) return NextResponse.json({ error: "Equipamento não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, equipamento.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!(await hasModulePermission(session.user.id, "manutencao", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite programar manutenções preventivas." },
      { status: 403 }
    );
  }

  // O responsável precisa ter acesso a esta loja — sem essa checagem, qualquer usuário ativo
  // da empresa toda podia ser designado responsável por uma preventiva de uma loja à qual não
  // tem acesso nenhum.
  if (body.responsavelId) {
    const invalidIds = await findUsersWithoutEmpresaAccess([body.responsavelId], equipamento.empresaId);
    if (invalidIds.length > 0) {
      return NextResponse.json({ error: "Esse responsável não tem acesso a esta loja." }, { status: 400 });
    }
  }

  const preventiva = await prisma.manutencaoPreventiva.create({
    data: {
      equipamentoId: body.equipamentoId,
      tipoServico: body.tipoServico,
      descricao: body.descricao || null,
      frequencia: body.frequencia || "MENSAL",
      intervaloDiasCustom: body.intervaloDiasCustom ? Number(body.intervaloDiasCustom) : null,
      horario: body.horario || null,
      responsavelId: body.responsavelId || null,
      prestadorId: body.prestadorId || null,
      custoPrevisto: body.custoPrevisto ? Number(body.custoPrevisto) : null,
      checklist: Array.isArray(body.checklist) && body.checklist.length > 0 ? JSON.stringify(body.checklist) : null,
      necessidadeParada: !!body.necessidadeParada,
      dataInicio: new Date(body.dataInicio),
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ preventiva });
}
