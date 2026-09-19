import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertEmpresaAccess, findUsersWithoutEmpresaAccess } from "@/lib/empresa";
import { CHAMADO_STATUS_LABEL } from "@/lib/manutencao";
import {
  MANAGER_ROLES,
  getManutencaoDonoIds,
  getStoreManagers,
  logChamadoHistorico,
  notifyManutencaoUser,
} from "@/lib/manutencao-server";
import { hasModulePermission } from "@/lib/authz";

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
  if (!(await hasModulePermission(session.user.id, "manutencao", "canView"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver a Manutenção." }, { status: 403 });
  }
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
  const isManager = MANAGER_ROLES.includes(session.user.role);
  const canManage = isManager || existing.solicitanteId === session.user.id;
  if (!canManage) {
    return NextResponse.json({ error: "Você não pode alterar este chamado." }, { status: 403 });
  }

  const body = await req.json();

  // Só a gestão pode aprovar (isso normalmente acontece via aprovação de orçamento,
  // em /api/manutencao/orcamentos/[id], já restrita a MANAGER_ROLES) ou marcar como
  // resolvido — o próprio solicitante não pode se auto-aprovar nem se auto-resolver.
  if (body.status && (body.status === "APROVADO" || body.status === "RESOLVIDO") && !isManager) {
    return NextResponse.json({ error: "Só a gestão pode aprovar ou resolver um chamado." }, { status: 403 });
  }
  // Só a gestão decide quem é o responsável pelo chamado.
  if (body.responsavelId !== undefined && (body.responsavelId || null) !== existing.responsavelId) {
    if (!isManager) {
      return NextResponse.json({ error: "Só a gestão pode definir o responsável pelo chamado." }, { status: 403 });
    }
    // O novo responsável precisa ter acesso a esta loja — sem essa checagem, qualquer usuário
    // ativo da empresa toda podia ser designado responsável por um chamado de uma loja à qual
    // não tem acesso nenhum.
    if (body.responsavelId) {
      const invalidIds = await findUsersWithoutEmpresaAccess([body.responsavelId], existing.empresaId);
      if (invalidIds.length > 0) {
        return NextResponse.json({ error: "Esse colaborador não tem acesso a esta loja." }, { status: 400 });
      }
    }
  }

  if (body.status === "RESOLVIDO" && !(body.descricaoSolucao || existing.descricaoSolucao)) {
    return NextResponse.json({ error: "Descreva a solução aplicada antes de resolver o chamado." }, { status: 400 });
  }

  // hasModulePermission é aplicado depois de toda a lógica fina acima (canManage, restrições de
  // aprovar/resolver/trocar responsável) — ela restringe MAIS um usuário específico dentro do que
  // essas regras já permitiriam, nunca substituindo nenhuma delas.
  if (!(await hasModulePermission(session.user.id, "manutencao", "canEdit"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite atualizar chamados de manutenção." },
      { status: 403 }
    );
  }

  const wasDraft = existing.status === "RASCUNHO";
  const isSendingDraft = wasDraft && body.status && body.status !== "RASCUNHO";

  const novoPrazo = body.prazo !== undefined ? (body.prazo ? new Date(body.prazo) : null) : undefined;

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
    prazo: novoPrazo,
    descricaoSolucao: body.descricaoSolucao !== undefined ? body.descricaoSolucao || null : undefined,
  };
  if (body.status === "RESOLVIDO" && existing.status !== "RESOLVIDO") {
    data.resolvidoEm = new Date();
  }

  // Zera o aviso de "chamado atrasado" (processChamadoAtrasoAlertas, @/lib/manutencao-server.ts)
  // sempre que o motivo que o tornaria obsoleto acontece aqui: o prazo mudou (o atraso avisado
  // era em cima do prazo antigo — um novo prazo merece ser reavaliado do zero, podendo gerar um
  // novo aviso se também for perdido) ou o chamado estava resolvido/cancelado e foi reaberto
  // (a checagem periódica ignora RESOLVIDO/CANCELADO, então um chamado reaberto com prazo já
  // vencido nunca mais seria reavaliado sem isso). Sem esse reset, `atrasoNotificadoEm` continua
  // preenchido para sempre e o chamado nunca mais gera um aviso de atraso, mesmo que volte a se
  // enquadrar de verdade.
  const prazoMudou = novoPrazo !== undefined && (novoPrazo?.getTime() ?? null) !== (existing.prazo?.getTime() ?? null);
  const statusTerminal = ["RESOLVIDO", "CANCELADO"];
  const foiReaberto =
    !!body.status && statusTerminal.includes(existing.status) && !statusTerminal.includes(body.status);
  if (prazoMudou || foiReaberto) {
    data.atrasoNotificadoEm = null;
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
    // Enviar um rascunho é a mesma situação de "chamado novo" de POST /api/manutencao/chamados
    // (o chamado só passa a existir de verdade pra quem não é gestão a partir daqui) — mesma
    // dedupe (jaNotificados) pra ninguém receber aviso duplicado por se enquadrar em mais de um
    // grupo (ex.: um ADMINISTRADOR que também é o responsável, ou também conta como gestor no
    // caso urgente).
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
      const managers = await getStoreManagers(chamado.empresaId);
      for (const userId of managers) {
        if (jaNotificados.has(userId)) continue;
        jaNotificados.add(userId);
        await notifyManutencaoUser(
          userId,
          "CHAMADO_URGENTE",
          "Chamado urgente",
          `Chamado urgente aberto: "${chamado.titulo}" (${chamado.protocolo}).`,
          chamado.id
        );
      }
    }

    // "O dono" (todo usuário ativo com cargo ADMINISTRADOR) é sempre notificado, qualquer
    // prioridade — mesma garantia de POST /api/manutencao/chamados. Ver getManutencaoDonoIds
    // (@/lib/manutencao-server.ts).
    const donoIds = await getManutencaoDonoIds();
    for (const userId of donoIds) {
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
  if (!(await hasModulePermission(session.user.id, "manutencao", "canDelete"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite excluir chamados de manutenção." },
      { status: 403 }
    );
  }

  await prisma.chamado.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
