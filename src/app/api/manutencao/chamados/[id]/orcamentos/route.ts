import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { MANAGER_ROLES, isValidBlobUrl, logChamadoHistorico, notifyManutencaoUser } from "@/lib/manutencao-server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode registrar orçamentos." }, { status: 403 });
  }
  const { id } = await params;

  const chamado = await prisma.chamado.findUnique({ where: { id } });
  if (!chamado) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, chamado.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }

  const body = await req.json();
  if (!body.prestadorId) {
    return NextResponse.json({ error: "Selecione o prestador." }, { status: 400 });
  }

  if (Array.isArray(body.anexos) && body.anexos.some((a: { fileUrl?: string }) => !isValidBlobUrl(a?.fileUrl))) {
    return NextResponse.json({ error: "Anexo inválido." }, { status: 400 });
  }

  const valorMaoDeObra = Number(body.valorMaoDeObra) || 0;
  const valorPecas = Number(body.valorPecas) || 0;
  const valorTotal = valorMaoDeObra + valorPecas;

  const orcamento = await prisma.$transaction(async (tx) => {
    const created = await tx.orcamento.create({
      data: {
        chamadoId: id,
        prestadorId: body.prestadorId,
        descricao: body.descricao || null,
        valorMaoDeObra,
        valorPecas,
        valorTotal,
        prazo: body.prazo || null,
        garantia: body.garantia || null,
        status: "RECEBIDO",
        createdById: session.user.id,
      },
    });
    if (Array.isArray(body.anexos) && body.anexos.length > 0) {
      await tx.manutencaoAnexo.createMany({
        data: body.anexos.map((a: { name: string; fileUrl: string; mimeType?: string; sizeBytes?: number }) => ({
          orcamentoId: created.id,
          name: a.name,
          fileUrl: a.fileUrl,
          mimeType: a.mimeType || null,
          sizeBytes: a.sizeBytes || null,
          tipo: "DOCUMENTO",
          uploadedById: session.user.id,
        })),
      });
    }
    return tx.orcamento.findUniqueOrThrow({
      where: { id: created.id },
      include: { prestador: true, anexos: true },
    });
  });

  await logChamadoHistorico(id, session.user.id, "ORCAMENTO_ADICIONADO", `${orcamento.prestador.nome} — R$ ${valorTotal.toFixed(2)}`);

  const notifyId = chamado.responsavelId ?? chamado.solicitanteId;
  if (notifyId !== session.user.id) {
    await notifyManutencaoUser(
      notifyId,
      "ORCAMENTO_RECEBIDO",
      "Orçamento recebido",
      `Um orçamento de ${orcamento.prestador.nome} (R$ ${valorTotal.toFixed(2)}) foi registrado para o chamado "${chamado.titulo}" (${chamado.protocolo}).`,
      id
    );
  }

  return NextResponse.json({ orcamento });
}
