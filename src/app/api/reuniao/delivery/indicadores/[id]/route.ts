import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";
import { findReuniaoCustomIndicatorForMeeting, parseSecondaryIndicatorFields, REUNIAO_INDICATOR_UNIDADES } from "@/lib/reuniao-server";

/**
 * Edita nome/unidade/ícone/valor padrão de um indicador já criado — só
 * atualiza os campos enviados (todos opcionais), sem tocar no histórico de
 * valores por período (ReuniaoCustomIndicatorValue), já que é um UPDATE
 * nessa mesma linha, não uma recriação.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "reuniao", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar indicadores da Reunião Delivery." },
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
  const indicator = await findReuniaoCustomIndicatorForMeeting(id, empresa.id, "DELIVERY");
  if (!indicator) {
    return NextResponse.json({ error: "Indicador não encontrado." }, { status: 404 });
  }

  const body = await req.json();
  const data: {
    nome?: string;
    unidade?: (typeof REUNIAO_INDICATOR_UNIDADES)[number];
    icon?: string;
    valorPadrao?: number;
    nomeSecundario?: string | null;
    unidadeSecundaria?: (typeof REUNIAO_INDICATOR_UNIDADES)[number] | null;
  } = {};

  if (body.nome !== undefined) {
    const nome = String(body.nome).trim();
    if (!nome) return NextResponse.json({ error: "Informe um nome para o indicador." }, { status: 400 });
    data.nome = nome;
  }

  if (body.unidade !== undefined && REUNIAO_INDICATOR_UNIDADES.includes(body.unidade)) {
    data.unidade = body.unidade;
  }

  if (typeof body.icon === "string" && body.icon.trim()) {
    data.icon = body.icon.trim();
  }

  if (body.valorPadrao !== undefined && body.valorPadrao !== "") {
    const valorPadrao = Number(body.valorPadrao);
    if (!Number.isNaN(valorPadrao)) data.valorPadrao = valorPadrao;
  }

  // Segundo valor (indicador "composto") — só mexe quando o body toca em
  // nomeSecundario/unidadeSecundaria (ver parseSecondaryIndicatorFields);
  // não tocar mantém o que já está salvo, mesmo padrão dos outros campos
  // acima.
  const secondary = parseSecondaryIndicatorFields(body);
  if (secondary.touched && !secondary.ok) {
    return NextResponse.json({ error: secondary.error }, { status: 400 });
  }
  if (secondary.touched && secondary.ok) {
    data.nomeSecundario = secondary.nomeSecundario;
    data.unidadeSecundaria = secondary.unidadeSecundaria;
  }

  const updated =
    Object.keys(data).length > 0 ? await prisma.reuniaoCustomIndicator.update({ where: { id }, data }) : indicator;

  return NextResponse.json({ indicator: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "reuniao", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir indicadores da Reunião Delivery." },
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
  const indicator = await findReuniaoCustomIndicatorForMeeting(id, empresa.id, "DELIVERY");
  if (!indicator) {
    return NextResponse.json({ error: "Indicador não encontrado." }, { status: 404 });
  }

  // Os valores mensais (ReuniaoCustomIndicatorValue) são apagados junto via onDelete: Cascade —
  // exclui só esse indicador, sem afetar o resto do fechamento do mês (DeliveryMeeting).
  await prisma.reuniaoCustomIndicator.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
