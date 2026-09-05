import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess } from "@/lib/empresa";
import { CHAMADO_STATUS_LABEL } from "@/lib/manutencao";
import {
  MANAGER_ROLES,
  getStoreManagers,
  logChamadoHistorico,
  notifyManutencaoUser,
} from "@/lib/manutencao-server";

const CHAMADO_DETAIL_INCLUDE = {
  empresa: { select: { id: true, name: true, color: true } },
  equipamento: true,
  solicitante: { select: { id: true, name: true } },
  responsavel: { select: { id: true, name: true } },
  comentarios: { orderBy: { createdAt: "asc" as const }, include: { author: { select: { id: true, name: true } } } },
  anexos: { orderBy: { createdAt: "desc" as const }, include: { uploadedBy: { select: { id: true, name: true } } } },
  historico: { orderBy: { createdAt: "asc" as const }, include: { user: { select: { id: true, name: true } } } },
  registros: { orderBy: { data: "desc" as const }, include: { responsavel: { select: { id: true, name: true } } } },
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const chamado = await prisma.chamado.findUnique({ where: { id }, include: CHAMADO_DETAIL_INCLUDE });
  if (!chamado) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, chamado.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  if (chamado.status === "RASCUNHO" && chamado.solicitanteId !== session.user.id && !MANAGER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  }

  return NextResponse.json({ chamado });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.chamado.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  const canManage = MANAGER_ROLES.includes(session.user.role) || existing.solicitanteId === session.user.id;
  if (!canManage) {
    return NextResponse.json({ error: "Você não pode alterar este chamado." }, { status: 403 });
  }

  const body = await req.json();

  if (body.status === "RESOLVIDO" && !(body.descricaoSolucao || existing.descricaoSolucao)) {
    return NextResponse.json({ error: "Descreva a solução aplicada antes de resolver o chamado." }, { status: 400 });
  }

  const wasDraft = existing.status === "RASCUNHO";
  const isSendingDraft = wasDraft && body.status && body.status !== "RASCUNHO";

  const data: Record<string, unknown> = {
    titulo: body.titulo ?? undefined,
    descricao: body.descricao ?? undefined,
    setor: body.setor ?? undefined,
    localEspecifico: body.localEspecifico !== undefined ? body.localEspecifico || null : undefined,
    categoria: body.categoria ?? undefined,
    equipamentoId: body.equipamentoId !== undefined ? body.equipamentoId || null : undefined,
    prioridade: body.prioridade ?? undefined,
    status: body.status ?? undefined,
    responsavelId: body.responsavelId !== undefined ? body.responsavelId || null : undefined,
    prazo: body.prazo !== undefined ? (body.prazo ? new Date(body.prazo) : null) : undefined,
    descricaoSolucao: body.descricaoSolucao !== undefined ? body.descricaoSolucao || null : undefined,
  };
  if (body.status === "RESOLVIDO" && existing.status !== "RESOLVIDO") {
    data.resolvidoEm = new Date();
  }

  const chamado = await prisma.chamado.update({ where: { id }, data });

  let historyEntry = null;
  if (body.status && body.status !== existing.status) {
    const fromLabel = CHAMADO_STATUS_LABEL[existing.status] ?? existing.status;
    const toLabel = CHAMADO_STATUS_LABEL[body.status] ?? body.status;
    await logChamadoHistorico(id, session.user.id, "STATUS_CHANGED", `${fromLabel} → ${toLabel}`);
    historyEntry = { action: "STATUS_CHANGED", detail: `${fromLabel} → ${toLabel}` };
  }
  if (body.responsavelId !== undefined && body.responsavelId !== existing.responsavelId) {
    await logChamadoHistorico(id, session.user.id, "RESPONSAVEL_CHANGED");
  }

  if (isSendingDraft) {
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
      const managers = await getStoreManagers(chamado.empresaId);
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

  if (body.status === "RESOLVIDO" && existing.status !== "RESOLVIDO" && existing.solicitanteId !== session.user.id) {
    await notifyManutencaoUser(
      existing.solicitanteId,
      "CHAMADO_RESOLVIDO",
      "Chamado resolvido",
      `O chamado "${chamado.titulo}" (${chamado.protocolo}) foi resolvido.`,
      chamado.id
    );
  }

  return NextResponse.json({ chamado, historyEntry });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.chamado.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!(await assertEmpresaAccess(session.user.id, session.user.role, existing.empresaId))) {
    return NextResponse.json({ error: "Sem acesso a essa loja." }, { status: 403 });
  }
  const canManage = MANAGER_ROLES.includes(session.user.role) || existing.solicitanteId === session.user.id;
  if (!canManage) return NextResponse.json({ error: "Você não pode excluir este chamado." }, { status: 403 });
  if (existing.status !== "RASCUNHO") {
    return NextResponse.json({ error: "Só é possível excluir chamados em rascunho. Cancele-o em vez disso." }, { status: 409 });
  }

  await prisma.chamado.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
