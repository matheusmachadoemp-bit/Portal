import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext, requireActiveSingleEmpresa } from "@/lib/empresa";
import {
  MANAGER_ROLES,
  generateChamadoProtocolo,
  getStoreManagers,
  logChamadoHistorico,
  notifyManutencaoUser,
} from "@/lib/manutencao-server";

const CHAMADO_LIST_INCLUDE = {
  empresa: { select: { id: true, name: true, color: true } },
  equipamento: { select: { id: true, nome: true, codigo: true, fotoUrl: true } },
  solicitante: { select: { id: true, name: true } },
  responsavel: { select: { id: true, name: true } },
  anexos: { where: { tipo: "FOTO" as const }, take: 1, select: { fileUrl: true } },
  _count: { select: { comentarios: true } },
};

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });
  const empresaIds = empresaIdsForContext(ctx);

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const prioridade = searchParams.get("prioridade");
  const categoria = searchParams.get("categoria");
  const setor = searchParams.get("setor");
  const equipamentoId = searchParams.get("equipamentoId");
  const responsavelId = searchParams.get("responsavelId");
  const view = searchParams.get("view"); // minhas | todas
  const q = searchParams.get("q");

  const and: Record<string, unknown>[] = [{ empresaId: { in: empresaIds } }];
  if (status) and.push({ status });
  if (prioridade) and.push({ prioridade });
  if (categoria) and.push({ categoria });
  if (setor) and.push({ setor });
  if (equipamentoId) and.push({ equipamentoId });
  if (responsavelId) and.push({ responsavelId });
  if (view === "minhas") and.push({ solicitanteId: session.user.id });
  if (q) {
    and.push({
      OR: [
        { titulo: { contains: q, mode: "insensitive" } },
        { protocolo: { contains: q, mode: "insensitive" } },
        { descricao: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  // Rascunhos só aparecem pra quem criou ou pra gestão da loja.
  if (!MANAGER_ROLES.includes(session.user.role)) {
    and.push({ OR: [{ status: { not: "RASCUNHO" } }, { solicitanteId: session.user.id }] });
  }
  const where = { AND: and };

  const chamados = await prisma.chamado.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: CHAMADO_LIST_INCLUDE,
  });

  return NextResponse.json({ chamados });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível abrir chamado no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const body = await req.json();
  if (!body.titulo || !body.descricao || !body.setor) {
    return NextResponse.json({ error: "Título, descrição e setor são obrigatórios." }, { status: 400 });
  }

  const status = body.status === "RASCUNHO" ? "RASCUNHO" : "ABERTO";

  const chamado = await prisma.$transaction(async (tx) => {
    const created = await tx.chamado.create({
      data: {
        protocolo: `TEMP-${Date.now()}`,
        titulo: body.titulo,
        descricao: body.descricao,
        empresaId: empresa.id,
        setor: body.setor,
        localEspecifico: body.localEspecifico || null,
        categoria: body.categoria || "OUTRO",
        equipamentoId: body.equipamentoId || null,
        prioridade: body.prioridade || "MEDIA",
        status,
        solicitanteId: session.user.id,
        responsavelId: body.responsavelId || null,
        prazo: body.prazo ? new Date(body.prazo) : null,
      },
    });
    await generateChamadoProtocolo(tx, created.id, created.sequence);
    if (Array.isArray(body.anexos) && body.anexos.length > 0) {
      await tx.manutencaoAnexo.createMany({
        data: body.anexos.map((a: { name: string; fileUrl: string; mimeType?: string; sizeBytes?: number; tipo?: string }) => ({
          chamadoId: created.id,
          name: a.name,
          fileUrl: a.fileUrl,
          mimeType: a.mimeType || null,
          sizeBytes: a.sizeBytes || null,
          tipo: a.tipo || "FOTO",
          uploadedById: session.user.id,
        })),
      });
    }
    return tx.chamado.findUniqueOrThrow({ where: { id: created.id }, include: CHAMADO_LIST_INCLUDE });
  });

  await logChamadoHistorico(chamado.id, session.user.id, "CREATED", `Protocolo ${chamado.protocolo}`);

  if (status !== "RASCUNHO") {
    if (chamado.responsavelId && chamado.responsavelId !== session.user.id) {
      await notifyManutencaoUser(
        chamado.responsavelId,
        "NOVO_CHAMADO",
        "Novo chamado de manutenção",
        `Você foi definido como responsável pelo chamado "${chamado.titulo}" (${chamado.protocolo}).`,
        chamado.id
      );
    }
    if (chamado.prioridade === "URGENTE") {
      const managers = await getStoreManagers(empresa.id);
      for (const userId of managers) {
        if (userId === session.user.id) continue;
        await notifyManutencaoUser(
          userId,
          "CHAMADO_URGENTE",
          "Chamado urgente",
          `Chamado urgente aberto: "${chamado.titulo}" (${chamado.protocolo}).`,
          chamado.id
        );
      }
    }
  }

  return NextResponse.json({ chamado });
}
