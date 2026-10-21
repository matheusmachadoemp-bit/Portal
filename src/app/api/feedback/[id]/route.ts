import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { hasModulePermission } from "@/lib/authz";
import {
  FEEDBACK_STATUS_REQUIRES_SOLUCAO,
  FEEDBACK_STATUS_TERMINAL,
  isValidStatusForTipo,
  logFeedbackHistory,
  notifyFeedbackResponsavelAssigned,
  notifyFeedbackStatusChange,
} from "@/lib/feedback-server";
import type { FeedbackPrioridade } from "@prisma/client";

const FEEDBACK_DETAIL_INCLUDE = {
  usuarioCriador: { select: { id: true, name: true, email: true } },
  responsavel: { select: { id: true, name: true } },
  empresa: { select: { id: true, name: true, color: true } },
  categoria: { select: { id: true, name: true } },
  subcategoria: { select: { id: true, name: true, category: { select: { name: true } } } },
  anexos: { orderBy: { createdAt: "desc" as const }, include: { uploadedBy: { select: { id: true, name: true } } } },
  historico: { orderBy: { createdAt: "asc" as const }, include: { usuarioResponsavel: { select: { id: true, name: true } } } },
  comentarios: { orderBy: { createdAt: "asc" as const }, include: { autor: { select: { id: true, name: true } } } },
  possivelDuplicataDe: { select: { id: true, protocolo: true, titulo: true, status: true } },
  duplicatas: { select: { id: true, protocolo: true, titulo: true, status: true } },
};

const PRIORIDADES: FeedbackPrioridade[] = ["BAIXA", "MEDIA", "ALTA", "CRITICA"];

async function requireAdminAccess(userId: string, role: string, action: "canView" | "canEdit") {
  if (role !== "ADMINISTRADOR") return false;
  return hasModulePermission(userId, "bugs-melhorias", action);
}

/** GET — detalhe completo (admin only). Inclui anexos, histórico e comentários. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireAdminAccess(session.user.id, session.user.role, "canView"))) {
    return NextResponse.json({ error: "Sem permissão para acessar a Central de Bugs e Melhorias." }, { status: 403 });
  }

  const { id } = await params;
  const report = await prisma.feedbackReport.findUnique({ where: { id }, include: FEEDBACK_DETAIL_INCLUDE });
  if (!report) return NextResponse.json({ error: "Relato não encontrado." }, { status: 404 });

  return NextResponse.json({ report });
}

/**
 * PATCH — altera status/prioridade/responsável/descriçãoSolução/versãoCorrigidaEm (admin only).
 * Grava uma linha em `FeedbackHistory` por campo alterado (valor anterior/novo/quem/quando +
 * comentário opcional, compartilhado entre todos os campos da mesma chamada).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireAdminAccess(session.user.id, session.user.role, "canEdit"))) {
    return NextResponse.json({ error: "Sem permissão para atualizar a Central de Bugs e Melhorias." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.feedbackReport.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Relato não encontrado." }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });

  if (body.status !== undefined && !isValidStatusForTipo(existing.tipo, body.status)) {
    return NextResponse.json({ error: "Status inválido para este tipo de relato." }, { status: 400 });
  }
  if (body.prioridade !== undefined && !PRIORIDADES.includes(body.prioridade)) {
    return NextResponse.json({ error: "Prioridade inválida." }, { status: 400 });
  }

  const novoResponsavelId: string | null | undefined =
    body.responsavelId !== undefined ? body.responsavelId || null : undefined;
  if (novoResponsavelId) {
    const target = await prisma.user.findUnique({ where: { id: novoResponsavelId }, select: { id: true, active: true } });
    if (!target || !target.active) {
      return NextResponse.json({ error: "Usuário responsável inválido ou inativo." }, { status: 400 });
    }
  }

  const novaDescricaoSolucao: string | null | undefined =
    body.descricaoSolucao !== undefined ? String(body.descricaoSolucao || "").trim() || null : undefined;
  const novaVersaoCorrigidaEm: string | null | undefined =
    body.versaoCorrigidaEm !== undefined ? String(body.versaoCorrigidaEm || "").trim() || null : undefined;
  const comentario: string | null = body.comentario ? String(body.comentario).trim().slice(0, 2000) || null : null;

  if (body.status && FEEDBACK_STATUS_REQUIRES_SOLUCAO.has(body.status)) {
    const descricaoFinal = novaDescricaoSolucao !== undefined ? novaDescricaoSolucao : existing.descricaoSolucao;
    if (!descricaoFinal) {
      return NextResponse.json(
        { error: "Descreva a solução aplicada antes de marcar como corrigido/implementado." },
        { status: 400 }
      );
    }
  }

  const data: Record<string, unknown> = {};
  if (body.status !== undefined) data.status = body.status;
  if (body.prioridade !== undefined) data.prioridade = body.prioridade;
  if (novoResponsavelId !== undefined) data.responsavelId = novoResponsavelId;
  if (novaDescricaoSolucao !== undefined) data.descricaoSolucao = novaDescricaoSolucao;
  if (novaVersaoCorrigidaEm !== undefined) data.versaoCorrigidaEm = novaVersaoCorrigidaEm;

  if (body.status !== undefined && body.status !== existing.status) {
    const eraTerminal = FEEDBACK_STATUS_TERMINAL.has(existing.status);
    const ehTerminal = FEEDBACK_STATUS_TERMINAL.has(body.status);
    if (ehTerminal && !eraTerminal) data.dataConclusao = new Date();
    else if (!ehTerminal && eraTerminal) data.dataConclusao = null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nenhuma alteração informada." }, { status: 400 });
  }

  const updated = await prisma.feedbackReport.update({ where: { id }, data, include: FEEDBACK_DETAIL_INCLUDE });

  const currentUserId = session.user.id;
  const historyEntries: { tipoAlteracao: string; valorAnterior: string | null; valorNovo: string | null }[] = [];
  async function logIfChanged(tipoAlteracao: string, valorAnterior: string | null, valorNovo: string | null) {
    if (valorAnterior === valorNovo) return;
    await logFeedbackHistory(id, currentUserId, tipoAlteracao, valorAnterior, valorNovo, comentario);
    historyEntries.push({ tipoAlteracao, valorAnterior, valorNovo });
  }

  if (body.status !== undefined) await logIfChanged("STATUS", existing.status, body.status);
  if (body.prioridade !== undefined) await logIfChanged("PRIORIDADE", existing.prioridade, body.prioridade);
  if (novoResponsavelId !== undefined) await logIfChanged("RESPONSAVEL", existing.responsavelId, novoResponsavelId);
  if (novaDescricaoSolucao !== undefined) await logIfChanged("DESCRICAO_SOLUCAO", existing.descricaoSolucao, novaDescricaoSolucao);
  if (novaVersaoCorrigidaEm !== undefined) await logIfChanged("VERSAO_CORRIGIDA_EM", existing.versaoCorrigidaEm, novaVersaoCorrigidaEm);

  if (novoResponsavelId !== undefined && novoResponsavelId !== existing.responsavelId && novoResponsavelId && novoResponsavelId !== session.user.id) {
    await notifyFeedbackResponsavelAssigned({ id: updated.id, protocolo: updated.protocolo, titulo: updated.titulo }, novoResponsavelId);
  }
  if (body.status !== undefined && body.status !== existing.status && existing.usuarioCriadorId !== session.user.id) {
    await notifyFeedbackStatusChange(
      { id: updated.id, protocolo: updated.protocolo, titulo: updated.titulo },
      existing.usuarioCriadorId,
      existing.status,
      body.status
    );
  }

  return NextResponse.json({ report: updated, historyEntries });
}
