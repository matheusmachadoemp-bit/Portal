import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { MANAGER_ROLES } from "@/lib/manutencao-server";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Você não pode alterar esta ocorrência." }, { status: 403 });
  }
  const { id } = await params;

  const existing = await prisma.manutencaoPreventivaOcorrencia.findUnique({
    where: { id },
    include: { preventiva: { include: { equipamento: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.preventiva.equipamento.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }

  const body = await req.json();

  if (body.status === "REAGENDADA") {
    if (!body.novaData) return NextResponse.json({ error: "Informe a nova data." }, { status: 400 });
    if (!body.motivoReagendamento) return NextResponse.json({ error: "Informe o motivo do reagendamento." }, { status: 400 });
    await prisma.manutencaoPreventivaOcorrencia.update({
      where: { id },
      data: { status: "CANCELADA", motivoReagendamento: body.motivoReagendamento },
    });
    const novaOcorrencia = await prisma.manutencaoPreventivaOcorrencia.upsert({
      where: { preventivaId_dataProgramada: { preventivaId: existing.preventivaId, dataProgramada: new Date(body.novaData) } },
      update: { status: "PROGRAMADA" },
      create: { preventivaId: existing.preventivaId, dataProgramada: new Date(body.novaData) },
    });
    return NextResponse.json({ ocorrencia: novaOcorrencia });
  }

  const ocorrencia = await prisma.manutencaoPreventivaOcorrencia.update({
    where: { id },
    data: {
      status: body.status ?? undefined,
    },
  });

  return NextResponse.json({ ocorrencia });
}
