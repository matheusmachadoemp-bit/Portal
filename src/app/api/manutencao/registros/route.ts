import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess, empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { MANAGER_ROLES, logChamadoHistorico, notifyManutencaoUser } from "@/lib/manutencao-server";

const ADVANCE_FROM_STATUSES = ["ABERTO", "AGUARDANDO_AVALIACAO", "AGUARDANDO_ORCAMENTO", "AGUARDANDO_APROVACAO", "APROVADO", "AGUARDANDO_PECA"];

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const { searchParams } = new URL(req.url);
  const equipamentoId = searchParams.get("equipamentoId");
  const chamadoId = searchParams.get("chamadoId");

  const where: Record<string, unknown> = { empresaId: { in: empresaIds } };
  if (equipamentoId) where.equipamentoId = equipamentoId;
  if (chamadoId) where.chamadoId = chamadoId;

  const registros = await prisma.manutencaoRegistro.findMany({
    where,
    orderBy: { data: "desc" },
    include: {
      equipamento: { select: { id: true, nome: true, codigo: true } },
      responsavel: { select: { id: true, name: true } },
      anexos: true,
    },
  });

  return NextResponse.json({ registros });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode registrar manutenções." }, { status: 403 });
  }

  const body = await req.json();
  if (!body.equipamentoId || !body.servicoExecutado || !body.data) {
    return NextResponse.json({ error: "Equipamento, serviço executado e data são obrigatórios." }, { status: 400 });
  }

  const equipamento = await prisma.equipamento.findUnique({ where: { id: body.equipamentoId } });
  if (!equipamento) return NextResponse.json({ error: "Equipamento não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, equipamento.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }

  let chamado = null;
  if (body.chamadoId) {
    chamado = await prisma.chamado.findUnique({ where: { id: body.chamadoId } });
    if (!chamado) return NextResponse.json({ error: "Chamado não encontrado." }, { status: 404 });
  }

  const valorMaoDeObra = Number(body.valorMaoDeObra) || 0;
  const valorPecas = Number(body.valorPecas) || 0;
  const valorOutros = Number(body.valorOutros) || 0;
  const valorTotal = valorMaoDeObra + valorPecas + valorOutros;
  const dataManutencao = new Date(body.data);
  const proximaManutencaoEm = body.proximaManutencaoEm ? new Date(body.proximaManutencaoEm) : null;

  const registro = await prisma.$transaction(async (tx) => {
    const created = await tx.manutencaoRegistro.create({
      data: {
        empresaId: equipamento.empresaId,
        equipamentoId: equipamento.id,
        chamadoId: body.chamadoId || null,
        tipo: body.tipo || "CORRETIVA",
        data: dataManutencao,
        horaInicio: body.horaInicio || null,
        horaFim: body.horaFim || null,
        servicoExecutado: body.servicoExecutado,
        problemaEncontrado: body.problemaEncontrado || null,
        solucaoAplicada: body.solucaoAplicada || null,
        pecasTrocadas: body.pecasTrocadas || null,
        prestador: body.prestador || null,
        responsavelId: body.responsavelId || session.user.id,
        valorMaoDeObra,
        valorPecas,
        valorOutros,
        valorTotal,
        garantiaServico: body.garantiaServico || null,
        proximaManutencaoEm,
        observacoes: body.observacoes || null,
        createdById: session.user.id,
      },
    });

    if (Array.isArray(body.anexos) && body.anexos.length > 0) {
      await tx.manutencaoAnexo.createMany({
        data: body.anexos.map((a: { name: string; fileUrl: string; mimeType?: string; sizeBytes?: number; tipo?: string }) => ({
          registroId: created.id,
          name: a.name,
          fileUrl: a.fileUrl,
          mimeType: a.mimeType || null,
          sizeBytes: a.sizeBytes || null,
          tipo: a.tipo || "FOTO",
          uploadedById: session.user.id,
        })),
      });
    }

    await tx.equipamento.update({
      where: { id: equipamento.id },
      data: {
        ultimaManutencaoEm: dataManutencao,
        proximaManutencaoEm: proximaManutencaoEm ?? equipamento.proximaManutencaoEm,
        status: equipamento.status === "PARADO" ? "FUNCIONANDO" : equipamento.status,
      },
    });

    if (chamado && ADVANCE_FROM_STATUSES.includes(chamado.status)) {
      await tx.chamado.update({ where: { id: chamado.id }, data: { status: "EM_MANUTENCAO" } });
    }

    return tx.manutencaoRegistro.findUniqueOrThrow({
      where: { id: created.id },
      include: { equipamento: { select: { id: true, nome: true, codigo: true } }, responsavel: { select: { id: true, name: true } }, anexos: true },
    });
  });

  if (chamado) {
    await logChamadoHistorico(chamado.id, session.user.id, "MANUTENCAO_REGISTRADA", body.servicoExecutado);
    if (chamado.solicitanteId !== session.user.id) {
      await notifyManutencaoUser(
        chamado.solicitanteId,
        "MANUTENCAO_REGISTRADA",
        "Manutenção registrada",
        `Uma manutenção foi registrada para o chamado "${chamado.titulo}" (${chamado.protocolo}).`,
        chamado.id
      );
    }
  }

  return NextResponse.json({ registro });
}
