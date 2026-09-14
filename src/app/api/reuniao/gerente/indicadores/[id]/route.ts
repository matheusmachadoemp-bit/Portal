import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

const UNIDADES = ["PERCENT", "CURRENCY", "NUMBER"] as const;

/**
 * Edita nome/unidade/ícone/valor padrão de um indicador já criado — só
 * atualiza os campos enviados (todos opcionais), sem tocar no histórico de
 * valores por período (GerenteCustomIndicatorValue), já que é um UPDATE
 * nessa mesma linha, não uma recriação.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "reuniao", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar indicadores da Reunião Gerente." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível editar indicadores no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const { id } = await params;
  const indicator = await prisma.gerenteCustomIndicator.findUnique({ where: { id } });
  if (!indicator || indicator.empresaId !== empresa.id) {
    return NextResponse.json({ error: "Indicador não encontrado." }, { status: 404 });
  }

  const body = await req.json();
  const data: {
    nome?: string;
    unidade?: (typeof UNIDADES)[number];
    icon?: string;
    valorPadrao?: number;
  } = {};

  if (body.nome !== undefined) {
    const nome = String(body.nome).trim();
    if (!nome) return NextResponse.json({ error: "Informe um nome para o indicador." }, { status: 400 });
    data.nome = nome;
  }

  if (body.unidade !== undefined && UNIDADES.includes(body.unidade)) {
    data.unidade = body.unidade;
  }

  if (typeof body.icon === "string" && body.icon.trim()) {
    data.icon = body.icon.trim();
  }

  if (body.valorPadrao !== undefined && body.valorPadrao !== "") {
    const valorPadrao = Number(body.valorPadrao);
    if (!Number.isNaN(valorPadrao)) data.valorPadrao = valorPadrao;
  }

  const updated =
    Object.keys(data).length > 0 ? await prisma.gerenteCustomIndicator.update({ where: { id }, data }) : indicator;

  return NextResponse.json({ indicator: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "reuniao", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir indicadores da Reunião Gerente." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível excluir indicadores no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const { id } = await params;
  const indicator = await prisma.gerenteCustomIndicator.findUnique({ where: { id } });
  if (!indicator || indicator.empresaId !== empresa.id) {
    return NextResponse.json({ error: "Indicador não encontrado." }, { status: 404 });
  }

  // Os valores mensais (GerenteCustomIndicatorValue) são apagados junto via onDelete: Cascade —
  // exclui só esse indicador, sem afetar o resto do fechamento do mês (GerenteMeeting).
  await prisma.gerenteCustomIndicator.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
