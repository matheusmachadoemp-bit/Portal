import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getActiveEmpresaContext, empresaIdsForContext } from "@/lib/empresa";
import { refreshOccurrenceStatuses } from "@/lib/checklist-server";
import { hasModulePermission } from "@/lib/authz";

const DETAIL_INCLUDE = {
  // Itens são retornados sem filtrar por `ativo` de propósito: uma resposta
  // registrada num item depois removido do template ainda precisa exibir o
  // título certo no histórico. A execução ativa filtra por `ativo` na sua
  // própria consulta (página de execução), não aqui.
  template: { include: { itens: { orderBy: { ordem: "asc" as const } } } },
  empresa: { select: { id: true, name: true } },
  responsavel: { select: { id: true, name: true } },
  respostas: {
    include: {
      fotos: { include: { uploadedBy: { select: { id: true, name: true } } } },
      respondidoPor: { select: { id: true, name: true } },
    },
  },
  fotos: { include: { uploadedBy: { select: { id: true, name: true } } } },
  escalationLogs: {
    include: { destinatario: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "tarefas", "canView", "checklist"))) {
    return NextResponse.json({ error: "Seu perfil de permissão não permite ver o Checklist." }, { status: 403 });
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { id } = await params;
  await refreshOccurrenceStatuses([id]);

  const occurrence = await prisma.checklistOccurrence.findFirst({
    where: { id, empresaId: { in: empresaIdsForContext(ctx) } },
    include: DETAIL_INCLUDE,
  });
  if (!occurrence) return NextResponse.json({ error: "Checklist não encontrado." }, { status: 404 });

  return NextResponse.json({ occurrence });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  const occurrence = await prisma.checklistOccurrence.findFirst({
    where: { id, empresaId: { in: empresaIdsForContext(ctx) } },
  });
  if (!occurrence) return NextResponse.json({ error: "Checklist não encontrado." }, { status: 404 });
  if (!(await hasModulePermission(session.user.id, "tarefas", "canEdit", "checklist"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite atualizar execuções de checklist." },
      { status: 403 }
    );
  }

  const data: Record<string, unknown> = {};
  if ("responsavelId" in body) data.responsavelId = body.responsavelId || null;
  if ("justificativa" in body) data.justificativa = body.justificativa || null;
  // O único status "forjável" por aqui é JUSTIFICADO (usado pelo botão "Justificar"
  // em ocorrências ATRASADO/NAO_REALIZADO). Concluir uma ocorrência (CONCLUIDO_NO_PRAZO/
  // CONCLUIDO_COM_ATRASO) precisa passar pelas validações de itens obrigatórios/fotos
  // da rota dedicada /complete — por isso não é aceito aqui.
  if ("status" in body) {
    if (body.status !== "JUSTIFICADO") {
      return NextResponse.json(
        { error: "Só é possível marcar como justificado por aqui. Para concluir, use a rota de conclusão." },
        { status: 400 }
      );
    }
    data.status = body.status;
  }

  const updated = await prisma.checklistOccurrence.update({ where: { id }, data });

  return NextResponse.json({ occurrence: updated });
}
