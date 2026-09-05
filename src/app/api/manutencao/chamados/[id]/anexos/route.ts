import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import type { ManutencaoAnexoTipo } from "@prisma/client";
import { assertEmpresaAccess } from "@/lib/empresa";
import { logChamadoHistorico } from "@/lib/manutencao-server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const chamado = await prisma.chamado.findUnique({ where: { id } });
  if (!chamado) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, chamado.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }

  const body = await req.json();
  const anexos: { name: string; fileUrl: string; mimeType?: string; sizeBytes?: number; tipo?: string }[] = Array.isArray(body.anexos)
    ? body.anexos
    : [];
  if (anexos.length === 0) return NextResponse.json({ error: "Nenhum anexo enviado." }, { status: 400 });

  await prisma.manutencaoAnexo.createMany({
    data: anexos.map((a) => ({
      chamadoId: id,
      name: a.name,
      fileUrl: a.fileUrl,
      mimeType: a.mimeType || null,
      sizeBytes: a.sizeBytes || null,
      tipo: (a.tipo as ManutencaoAnexoTipo) || "FOTO",
      uploadedById: session.user.id,
    })),
  });
  await logChamadoHistorico(id, session.user.id, "ANEXO_ADICIONADO", `${anexos.length} arquivo(s)`);

  const updated = await prisma.manutencaoAnexo.findMany({
    where: { chamadoId: id },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ anexos: updated });
}
