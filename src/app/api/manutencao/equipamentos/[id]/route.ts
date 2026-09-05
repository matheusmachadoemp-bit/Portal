import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { MANAGER_ROLES, notifyManutencaoUser, getStoreManagers } from "@/lib/manutencao-server";

const EQUIPAMENTO_DETAIL_INCLUDE = {
  empresa: { select: { id: true, name: true, color: true } },
  createdBy: { select: { id: true, name: true } },
  anexos: { orderBy: { createdAt: "desc" as const }, include: { uploadedBy: { select: { id: true, name: true } } } },
  chamados: {
    orderBy: { createdAt: "desc" as const },
    include: { solicitante: { select: { name: true } }, responsavel: { select: { name: true } } },
  },
  registros: {
    orderBy: { data: "desc" as const },
    include: { responsavel: { select: { name: true } } },
  },
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const equipamento = await prisma.equipamento.findUnique({ where: { id }, include: EQUIPAMENTO_DETAIL_INCLUDE });
  if (!equipamento) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, equipamento.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }

  const custoAcumulado = await prisma.manutencaoRegistro.aggregate({
    where: { equipamentoId: id },
    _sum: { valorTotal: true },
  });

  return NextResponse.json({ equipamento: { ...equipamento, custoAcumulado: custoAcumulado._sum.valorTotal ?? 0 } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.equipamento.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode editar equipamentos." }, { status: 403 });
  }

  const body = await req.json();

  const equipamento = await prisma.equipamento.update({
    where: { id },
    data: {
      nome: body.nome ?? undefined,
      fotoUrl: body.fotoUrl !== undefined ? body.fotoUrl || null : undefined,
      setor: body.setor ?? undefined,
      localizacao: body.localizacao !== undefined ? body.localizacao || null : undefined,
      categoria: body.categoria ?? undefined,
      marca: body.marca !== undefined ? body.marca || null : undefined,
      modelo: body.modelo !== undefined ? body.modelo || null : undefined,
      numeroSerie: body.numeroSerie !== undefined ? body.numeroSerie || null : undefined,
      dataCompra: body.dataCompra !== undefined ? (body.dataCompra ? new Date(body.dataCompra) : null) : undefined,
      valorCompra: body.valorCompra !== undefined ? (body.valorCompra ? Number(body.valorCompra) : null) : undefined,
      fornecedor: body.fornecedor !== undefined ? body.fornecedor || null : undefined,
      numeroNotaFiscal: body.numeroNotaFiscal !== undefined ? body.numeroNotaFiscal || null : undefined,
      garantiaAte: body.garantiaAte !== undefined ? (body.garantiaAte ? new Date(body.garantiaAte) : null) : undefined,
      vidaUtilEstimadaMeses:
        body.vidaUtilEstimadaMeses !== undefined ? (body.vidaUtilEstimadaMeses ? Number(body.vidaUtilEstimadaMeses) : null) : undefined,
      frequenciaManutencao: body.frequenciaManutencao ?? undefined,
      prestadorRecomendado: body.prestadorRecomendado !== undefined ? body.prestadorRecomendado || null : undefined,
      observacoes: body.observacoes !== undefined ? body.observacoes || null : undefined,
      status: body.status ?? undefined,
    },
  });

  if (body.status && body.status !== existing.status && body.status === "PARADO") {
    const managers = await getStoreManagers(existing.empresaId);
    for (const userId of managers) {
      await notifyManutencaoUser(
        userId,
        "EQUIPAMENTO_PARADO",
        "Equipamento parado",
        `"${equipamento.nome}" (${equipamento.codigo}) foi marcado como parado.`,
        null
      );
    }
  }

  return NextResponse.json({ equipamento });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.equipamento.findUnique({ where: { id }, include: { _count: { select: { chamados: true } } } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode excluir equipamentos." }, { status: 403 });
  }
  if (existing._count.chamados > 0) {
    return NextResponse.json(
      { error: "Este equipamento tem chamados vinculados e não pode ser excluído. Desative-o em vez disso." },
      { status: 409 }
    );
  }

  await prisma.equipamento.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
