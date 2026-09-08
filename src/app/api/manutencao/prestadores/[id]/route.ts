import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { MANAGER_ROLES } from "@/lib/manutencao-server";
import { getUserEmpresas } from "@/lib/empresa";
import { hasModulePermission } from "@/lib/authz";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const prestador = await prisma.prestador.findFirst({
    where: { id, OR: [{ empresaIds: { isEmpty: true } }, { empresaIds: { hasSome: empresaIds } }] },
    include: {
      orcamentos: { orderBy: { createdAt: "desc" }, include: { chamado: { select: { id: true, protocolo: true, titulo: true } } } },
      registros: { orderBy: { data: "desc" }, include: { equipamento: { select: { id: true, nome: true, codigo: true } } } },
    },
  });
  if (!prestador) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const valorTotal = await prisma.manutencaoRegistro.aggregate({ where: { prestadorId: id }, _sum: { valorTotal: true } });

  return NextResponse.json({ prestador: { ...prestador, valorTotalGasto: valorTotal._sum.valorTotal ?? 0 } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode editar prestadores." }, { status: 403 });
  }
  const { id } = await params;

  const existing = await prisma.prestador.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (existing.empresaIds.length > 0) {
    const empresasPermitidas = (await getUserEmpresas(session.user.id, session.user.role)).map((e) => e.id);
    if (!existing.empresaIds.some((eid) => empresasPermitidas.includes(eid))) {
      return NextResponse.json({ error: "Você não pode editar prestadores desta loja." }, { status: 403 });
    }
  }
  if (!(await hasModulePermission(session.user.id, "manutencao", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite editar prestadores." },
      { status: 403 }
    );
  }

  const body = await req.json();
  const prestador = await prisma.prestador.update({
    where: { id },
    data: {
      nome: body.nome ?? undefined,
      nomeContato: body.nomeContato !== undefined ? body.nomeContato || null : undefined,
      especialidade: body.especialidade !== undefined ? body.especialidade || null : undefined,
      telefone: body.telefone !== undefined ? body.telefone || null : undefined,
      whatsapp: body.whatsapp !== undefined ? body.whatsapp || null : undefined,
      email: body.email !== undefined ? body.email || null : undefined,
      documento: body.documento !== undefined ? body.documento || null : undefined,
      endereco: body.endereco !== undefined ? body.endereco || null : undefined,
      empresaIds: Array.isArray(body.empresaIds) ? body.empresaIds : undefined,
      avaliacao: body.avaliacao !== undefined ? (body.avaliacao ? Number(body.avaliacao) : null) : undefined,
      observacoes: body.observacoes !== undefined ? body.observacoes || null : undefined,
      active: body.active !== undefined ? !!body.active : undefined,
    },
  });

  return NextResponse.json({ prestador });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode excluir prestadores." }, { status: 403 });
  }
  const { id } = await params;

  const existing = await prisma.prestador.findUnique({
    where: { id },
    include: { _count: { select: { orcamentos: true, registros: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (existing.empresaIds.length > 0) {
    const empresasPermitidas = (await getUserEmpresas(session.user.id, session.user.role)).map((e) => e.id);
    if (!existing.empresaIds.some((eid) => empresasPermitidas.includes(eid))) {
      return NextResponse.json({ error: "Você não pode excluir prestadores desta loja." }, { status: 403 });
    }
  }
  if (!(await hasModulePermission(session.user.id, "manutencao", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir prestadores." },
      { status: 403 }
    );
  }
  if (existing._count.orcamentos > 0 || existing._count.registros > 0) {
    return NextResponse.json(
      { error: "Este prestador tem orçamentos ou manutenções vinculadas e não pode ser excluído. Desative-o em vez disso." },
      { status: 409 }
    );
  }

  await prisma.prestador.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
