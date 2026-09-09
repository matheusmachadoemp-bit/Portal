import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { TaskRecurrenceFreq } from "@prisma/client";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { generateDueTaskOccurrences, logTaskHistory, notifyUser } from "@/lib/tarefas-server";
import { hasModulePermission } from "@/lib/authz";

const TASK_INCLUDE = {
  empresa: { select: { id: true, name: true, color: true } },
  createdBy: { select: { id: true, name: true } },
  validator: { select: { id: true, name: true } },
  assignees: { include: { user: { select: { id: true, name: true } } } },
  checklist: { orderBy: { order: "asc" as const } },
  _count: { select: { comments: true, attachments: true } },
};

/** Inteiro >= 1 (opcionalmente limitado a `max`) a partir de um parâmetro de query; `null`/vazio/inválido/não-inteiro/<1 caem no `fallback`. */
function parsePositiveInt(value: string | null, fallback: number, max?: number): number {
  if (value === null) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return max !== undefined ? Math.min(n, max) : n;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const empresaIds = empresaIdsForContext(ctx);
  await generateDueTaskOccurrences(empresaIds);

  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view") ?? "todas"; // minhas | equipe | todas
  const empresaId = searchParams.get("empresaId");
  const sectorKey = searchParams.get("sectorKey");
  const responsavelId = searchParams.get("responsavelId");
  const status = searchParams.get("status"); // PENDENTE | EM_ANDAMENTO | AGUARDANDO_VALIDACAO | CONCLUIDA | ATRASADA
  const priority = searchParams.get("priority");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const q = searchParams.get("q");

  if (empresaId && !empresaIds.includes(empresaId)) {
    return NextResponse.json({ error: "Você não tem acesso a essa unidade." }, { status: 403 });
  }

  const where: Record<string, unknown> = {
    empresaId: { in: empresaId ? [empresaId] : empresaIds },
  };
  if (sectorKey) where.sectorKey = sectorKey;
  if (priority) where.priority = priority;
  if (q) where.title = { contains: q, mode: "insensitive" };
  if (from || to) {
    where.dueDate = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }
  if (status === "ATRASADA") {
    where.status = { not: "CONCLUIDA" };
    where.dueDate = { ...(where.dueDate as object), lt: new Date() };
  } else if (status) {
    where.status = status;
  }

  if (responsavelId) {
    where.assignees = { some: { userId: responsavelId } };
  } else if (view === "minhas") {
    where.assignees = { some: { userId: session.user.id } };
  } else if (view === "equipe") {
    where.assignees = { some: { userId: { not: session.user.id } } };
  }

  // Paginação opt-in — só ativa quando a chamada manda `page` e/ou
  // `pageSize` na query string (1-indexado; `pageSize` de 1 a 200, padrão
  // 50). Sem esses parâmetros, a rota devolve a lista inteira em `{ tasks }`
  // exatamente como sempre devolveu: hoje o único consumidor
  // (src/app/portal/tarefas/tarefas-client.tsx, `?view=minhas|equipe|todas`)
  // busca a lista inteira da aba e filtra/pagina no cliente por cima dela —
  // mudar o formato por padrão quebraria essa tela.
  //
  // Uma futura tela paginada deve mandar `?page=1&pageSize=50` (mais os
  // outros filtros já existentes, se quiser). Quando pelo menos um dos dois
  // vem preenchido, o formato da resposta passa a ser `{ tasks, pagination:
  // { page, pageSize, total, totalPages } }`, com `tasks` já contendo só os
  // itens da página pedida (mesmo `where`/`orderBy` de sempre).
  const pageParam = searchParams.get("page");
  const pageSizeParam = searchParams.get("pageSize");
  const paginar = pageParam !== null || pageSizeParam !== null;
  const page = parsePositiveInt(pageParam, 1);
  const pageSize = parsePositiveInt(pageSizeParam, 50, 200);

  const [rows, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      include: TASK_INCLUDE,
      ...(paginar ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
    }),
    paginar ? prisma.task.count({ where }) : null,
  ]);

  const tasks = rows.map((t) => ({
    ...t,
    overdue: !!t.dueDate && t.status !== "CONCLUIDA" && t.dueDate.getTime() < Date.now(),
  }));

  if (!paginar) return NextResponse.json({ tasks });

  const totalCount = total ?? 0;
  return NextResponse.json({
    tasks,
    pagination: { page, pageSize, total: totalCount, totalPages: Math.max(1, Math.ceil(totalCount / pageSize)) },
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModulePermission(session.user.id, "tarefas", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite criar tarefas." },
      { status: 403 }
    );
  }

  const ctx = await getActiveEmpresaContext();
  if (!ctx) return NextResponse.json({ error: "Sem acesso a nenhuma loja." }, { status: 403 });

  const body = await req.json();
  const empresaIds: string[] = Array.isArray(body.empresaIds) && body.empresaIds.length > 0 ? body.empresaIds : [];
  if (!body.title || empresaIds.length === 0 || !body.sectorKey) {
    return NextResponse.json({ error: "Título, unidade e setor são obrigatórios." }, { status: 400 });
  }

  const allowedIds = new Set(empresaIdsForContext(ctx));
  if (!empresaIds.every((id) => allowedIds.has(id))) {
    return NextResponse.json({ error: "Você não tem acesso a uma das unidades selecionadas." }, { status: 403 });
  }

  const assigneeIds: string[] = Array.isArray(body.assigneeIds) ? body.assigneeIds : [];
  const checklistItems: string[] = Array.isArray(body.checklist) ? body.checklist.filter((s: unknown) => typeof s === "string" && s.trim()) : [];
  const attachments: { name: string; fileUrl: string; mimeType?: string; sizeBytes?: number }[] = Array.isArray(body.attachments)
    ? body.attachments
    : [];

  const recurrenceFreq: TaskRecurrenceFreq = body.recurrenceFreq || "NENHUMA";
  const createdTasks = [];

  for (const empresaId of empresaIds) {
    let recurrenceId: string | null = null;

    if (recurrenceFreq !== "NENHUMA") {
      const recurrence = await prisma.taskRecurrence.create({
        data: {
          empresaId,
          title: body.title,
          description: body.description || null,
          sectorKey: body.sectorKey,
          priority: body.priority || "MEDIA",
          proofType: body.proofType || "NENHUMA",
          requiresValidation: !!body.requiresValidation,
          validatorId: body.requiresValidation ? body.validatorId || null : null,
          defaultAssigneeIds: assigneeIds.join(","),
          dueTime: body.dueTime || null,
          freq: recurrenceFreq,
          config: body.recurrenceConfig ? JSON.stringify(body.recurrenceConfig) : null,
          createdById: session.user.id,
        },
      });
      recurrenceId = recurrence.id;
      // Materializa a ocorrência de hoje imediatamente, se o padrão bater com hoje.
      await generateDueTaskOccurrences([empresaId]);
      continue;
    }

    const task = await prisma.task.create({
      data: {
        empresaId,
        title: body.title,
        description: body.description || null,
        sectorKey: body.sectorKey,
        priority: body.priority || "MEDIA",
        startDate: body.startDate ? new Date(body.startDate) : null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        dueTime: body.dueTime || null,
        recurrenceId,
        proofType: body.proofType || "NENHUMA",
        requiresValidation: !!body.requiresValidation,
        validatorId: body.requiresValidation ? body.validatorId || null : null,
        sourceType: body.sourceType || "MANUAL",
        sourceId: body.sourceId || null,
        createdById: session.user.id,
        assignees: assigneeIds.length > 0 ? { create: assigneeIds.map((userId) => ({ userId })) } : undefined,
        checklist: checklistItems.length > 0 ? { create: checklistItems.map((text, order) => ({ text, order })) } : undefined,
        attachments:
          attachments.length > 0
            ? {
                create: attachments.map((a) => ({
                  name: a.name,
                  fileUrl: a.fileUrl,
                  mimeType: a.mimeType || null,
                  sizeBytes: a.sizeBytes || null,
                  uploadedById: session.user.id,
                })),
              }
            : undefined,
      },
    });

    await logTaskHistory(task.id, session.user.id, "CREATED");
    for (const userId of assigneeIds) {
      if (userId === session.user.id) continue;
      await notifyUser(userId, "NOVA_TAREFA", "Nova tarefa", `Você recebeu a tarefa "${task.title}".`, task.id);
    }
    createdTasks.push(task);
  }

  return NextResponse.json({ tasks: createdTasks });
}
