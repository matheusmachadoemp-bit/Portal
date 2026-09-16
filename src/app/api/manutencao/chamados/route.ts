import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import {
  empresaIdsForContext,
  findUsersWithoutEmpresaAccess,
  getActiveEmpresaContext,
  requireActiveSingleEmpresa,
} from "@/lib/empresa";
import {
  MANAGER_ROLES,
  generateChamadoProtocolo,
  getManutencaoNotificacaoDestinatarios,
  getStoreManagers,
  isValidBlobUrl,
  logChamadoHistorico,
  notifyManutencaoUser,
} from "@/lib/manutencao-server";
import { hasModulePermission } from "@/lib/authz";

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
  if (!(await hasModulePermission(session.user.id, "manutencao", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver a Manutenção." }, { status: 403 });
  }

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
  if (!(await hasModulePermission(session.user.id, "manutencao", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite abrir chamados de manutenção." },
      { status: 403 }
    );
  }

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

  if (Array.isArray(body.anexos) && body.anexos.some((a: { fileUrl?: string }) => !isValidBlobUrl(a?.fileUrl))) {
    return NextResponse.json({ error: "Anexo inválido." }, { status: 400 });
  }

  // O responsável precisa ter acesso a esta loja — sem essa checagem, qualquer usuário ativo
  // da empresa toda podia ser designado responsável por um chamado de uma loja à qual não tem
  // acesso nenhum.
  if (body.responsavelId) {
    const invalidIds = await findUsersWithoutEmpresaAccess([body.responsavelId], empresa.id);
    if (invalidIds.length > 0) {
      return NextResponse.json({ error: "Esse responsável não tem acesso a esta loja." }, { status: 400 });
    }
  }

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
    // Cada usuário recebe no máximo um aviso de "novo chamado" por chamado
    // aberto: quem abriu nunca é notificado do próprio chamado, e alguém que
    // já foi notificado como responsável (ou como gestor, no caso de
    // prioridade urgente) não é notificado de novo por também estar
    // configurado como destinatário fixo (Manutenção > Configurações >
    // Notificações).
    const jaNotificados = new Set<string>([session.user.id]);

    if (chamado.responsavelId) {
      jaNotificados.add(chamado.responsavelId);
      if (chamado.responsavelId !== session.user.id) {
        await notifyManutencaoUser(
          chamado.responsavelId,
          "NOVO_CHAMADO",
          "Novo chamado de manutenção",
          `Você foi definido como responsável pelo chamado "${chamado.titulo}" (${chamado.protocolo}).`,
          chamado.id
        );
      }
    }
    if (chamado.prioridade === "URGENTE") {
      const managers = await getStoreManagers(empresa.id);
      for (const userId of managers) {
        jaNotificados.add(userId);
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

    const destinatariosConfigurados = await getManutencaoNotificacaoDestinatarios(empresa.id);
    for (const userId of destinatariosConfigurados) {
      if (jaNotificados.has(userId)) continue;
      jaNotificados.add(userId);
      await notifyManutencaoUser(
        userId,
        "NOVO_CHAMADO",
        "Novo chamado de manutenção",
        `Novo chamado de manutenção aberto: "${chamado.titulo}" (${chamado.protocolo}).`,
        chamado.id
      );
    }
  }

  return NextResponse.json({ chamado });
}
