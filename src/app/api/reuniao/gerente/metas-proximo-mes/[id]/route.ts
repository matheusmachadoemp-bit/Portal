import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

const PERIODO_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Busca uma meta pelo id, mas só devolve algo se ela for realmente da loja
 * ativa — mesma dupla checagem de posse de `findReuniaoCustomIndicatorForMeeting`
 * (src/lib/reuniao-server.ts), pra ninguém editar/excluir a meta de outra loja
 * (mesmo sabendo/adivinhando o id).
 */
async function findMeta(id: string, empresaId: string) {
  return prisma.metaProximoMes.findFirst({ where: { id, empresaId } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "reuniao", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar metas da Reunião Gerente." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível editar metas no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const { id } = await params;
  const meta = await findMeta(id, empresa.id);
  if (!meta) {
    return NextResponse.json({ error: "Meta não encontrada." }, { status: 404 });
  }

  const body = await req.json();
  const data: {
    periodo?: string;
    metrica?: string;
    valorAlvo?: string;
    valorPremio?: number;
    destinatario?: string;
    order?: number;
  } = {};

  if (body.periodo !== undefined) {
    const periodo = String(body.periodo).trim();
    if (!PERIODO_REGEX.test(periodo)) {
      return NextResponse.json({ error: "Período inválido (use o formato AAAA-MM)." }, { status: 400 });
    }
    data.periodo = periodo;
  }

  if (body.metrica !== undefined) {
    const metrica = String(body.metrica).trim();
    if (!metrica) return NextResponse.json({ error: "Informe a métrica da meta." }, { status: 400 });
    data.metrica = metrica;
  }

  if (body.valorAlvo !== undefined) {
    const valorAlvo = String(body.valorAlvo).trim();
    if (!valorAlvo) return NextResponse.json({ error: "Informe o valor-alvo da meta." }, { status: 400 });
    data.valorAlvo = valorAlvo;
  }

  if (body.valorPremio !== undefined) {
    data.valorPremio = Number(body.valorPremio) || 0;
  }

  if (body.destinatario !== undefined) {
    const destinatario = String(body.destinatario).trim();
    data.destinatario = destinatario || "Equipe";
  }

  if (body.order !== undefined && !Number.isNaN(Number(body.order))) {
    data.order = Number(body.order);
  }

  const updated = Object.keys(data).length > 0 ? await prisma.metaProximoMes.update({ where: { id }, data }) : meta;

  return NextResponse.json({ meta: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "reuniao", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir metas da Reunião Gerente." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível excluir metas no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const { id } = await params;
  const meta = await findMeta(id, empresa.id);
  if (!meta) {
    return NextResponse.json({ error: "Meta não encontrada." }, { status: 404 });
  }

  await prisma.metaProximoMes.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
