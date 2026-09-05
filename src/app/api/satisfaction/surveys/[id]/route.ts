import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { empresaIdsForContext, getActiveEmpresaContext } from "@/lib/empresa";
import { computeSurveyStatus } from "@/lib/satisfaction";
import type { SatisfactionQuestionType, SatisfactionTheme } from "@prisma/client";

const CAN_MANAGE_ROLES = ["ADMINISTRADOR", "GESTOR", "GERENTE"];

const DETAIL_INCLUDE = {
  publico: { include: { empresa: { select: { id: true, name: true } } } },
  perguntas: { include: { opcoes: { orderBy: { ordem: "asc" as const } } }, orderBy: { ordem: "asc" as const } },
  createdBy: { select: { id: true, name: true } },
};

async function findAccessibleSurvey(id: string) {
  const ctx = await getActiveEmpresaContext();
  if (!ctx) return { ctx: null, survey: null };
  const empresaIds = empresaIdsForContext(ctx);
  const survey = await prisma.satisfactionSurvey.findFirst({
    where: { id, publico: { some: { empresaId: { in: empresaIds } } } },
    include: DETAIL_INCLUDE,
  });
  return { ctx, survey, empresaIds };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { survey } = await findAccessibleSurvey(id);
  if (!survey) return NextResponse.json({ error: "Pesquisa não encontrada." }, { status: 404 });

  return NextResponse.json({ survey });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!CAN_MANAGE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Sem permissão para editar pesquisas." }, { status: 403 });
  }

  const { id } = await params;
  const { survey, empresaIds } = await findAccessibleSurvey(id);
  if (!survey) return NextResponse.json({ error: "Pesquisa não encontrada." }, { status: 404 });

  const body = await req.json();
  const isFullBuilderSave = "perguntas" in body || "publico" in body;

  if (isFullBuilderSave) {
    const publico: { empresaId: string; setor: string | null }[] = body.publico || [];
    const allowed = new Set(empresaIds);
    for (const p of publico) {
      if (!allowed.has(p.empresaId)) {
        return NextResponse.json({ error: "Você não tem acesso a uma das lojas selecionadas." }, { status: 403 });
      }
    }

    const incomingQuestions: Record<string, unknown>[] = body.perguntas || [];
    const existingQuestions = await prisma.satisfactionQuestion.findMany({
      where: { surveyId: id },
      select: { id: true, _count: { select: { respostas: true } } },
    });
    const answeredIds = new Set(existingQuestions.filter((q) => q._count.respostas > 0).map((q) => q.id));
    const incomingIds = new Set(incomingQuestions.map((q) => q.id).filter(Boolean));
    const removedQuestions = existingQuestions.filter((q) => !incomingIds.has(q.id));
    const removedIdsToDelete = removedQuestions.filter((q) => !answeredIds.has(q.id)).map((q) => q.id);
    const removedIdsToDeactivate = removedQuestions.filter((q) => answeredIds.has(q.id)).map((q) => q.id);
    const startDate = body.startDate ? new Date(body.startDate) : survey.startDate;
    const endDate = body.endDate ? new Date(body.endDate) : survey.endDate;
    const status = computeSurveyStatus({ startDate, endDate, currentStatus: survey.status, publish: body.publish === true });

    await prisma.$transaction([
      // Perguntas sem resposta alguma podem ser removidas de verdade; perguntas já
      // respondidas são só desativadas, para nunca apagar o histórico de respostas.
      ...(removedIdsToDelete.length ? [prisma.satisfactionQuestion.deleteMany({ where: { id: { in: removedIdsToDelete } } })] : []),
      ...(removedIdsToDeactivate.length
        ? [prisma.satisfactionQuestion.updateMany({ where: { id: { in: removedIdsToDeactivate } }, data: { ativo: false } })]
        : []),
      prisma.satisfactionAudience.deleteMany({ where: { surveyId: id } }),
      ...(publico.length
        ? [
            prisma.satisfactionAudience.createMany({
              data: publico.map((p) => ({ surveyId: id, empresaId: p.empresaId, setor: p.setor || null })),
            }),
          ]
        : []),
      ...incomingQuestions.map((q, idx) => {
        const data = {
          tipo: (q.tipo as SatisfactionQuestionType) || "AVALIACAO",
          tema: (q.tema as SatisfactionTheme) || null,
          titulo: q.titulo as string,
          orientacao: (q.orientacao as string) || null,
          obrigatoria: (q.obrigatoria as boolean) ?? true,
          ordem: idx,
          ativo: true,
        };
        return q.id
          ? prisma.satisfactionQuestion.update({ where: { id: q.id as string }, data })
          : prisma.satisfactionQuestion.create({
              data: {
                ...data,
                surveyId: id,
                opcoes: {
                  create: ((q.opcoes as { texto: string }[]) || []).map((o, oidx) => ({ texto: o.texto, ordem: oidx })),
                },
              },
            });
      }),
      prisma.satisfactionSurvey.update({
        where: { id },
        data: {
          title: body.title,
          description: body.description || null,
          startDate,
          endDate,
          status,
          anonima: body.anonima ?? survey.anonima,
          permitirApenasUmaResposta: body.permitirApenasUmaResposta ?? survey.permitirApenasUmaResposta,
          exibirResultadoColaborador: body.exibirResultadoColaborador ?? survey.exibirResultadoColaborador,
          permitirComentarioAdicional: body.permitirComentarioAdicional ?? survey.permitirComentarioAdicional,
          embaralharPerguntas: body.embaralharPerguntas ?? survey.embaralharPerguntas,
        },
      }),
    ]);

    // Opções só são substituídas por completo para perguntas que ainda não têm
    // nenhuma resposta — uma vez respondida, a pergunta já nasceu com as opções
    // certas (nested create) ou mantém as que já tinha, para não corromper
    // respostas de múltipla escolha já registradas.
    for (const q of incomingQuestions) {
      if (!q.id || answeredIds.has(q.id as string)) continue;
      const opcoes = (q.opcoes as { texto: string }[]) || [];
      await prisma.satisfactionQuestionOption.deleteMany({ where: { questionId: q.id as string } });
      if (opcoes.length) {
        await prisma.satisfactionQuestionOption.createMany({
          data: opcoes.map((o, oidx) => ({ questionId: q.id as string, texto: o.texto, ordem: oidx })),
        });
      }
    }
  } else if ("status" in body && body.status === "CANCELADA") {
    await prisma.satisfactionSurvey.update({ where: { id }, data: { status: "CANCELADA" } });
  } else {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  const updated = await prisma.satisfactionSurvey.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  return NextResponse.json({ survey: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!CAN_MANAGE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Sem permissão para excluir pesquisas." }, { status: 403 });
  }

  const { id } = await params;
  const { survey } = await findAccessibleSurvey(id);
  if (!survey) return NextResponse.json({ error: "Pesquisa não encontrada." }, { status: 404 });

  if (survey.status !== "RASCUNHO") {
    return NextResponse.json(
      { error: "Só é possível excluir pesquisas em rascunho — cancele em vez de excluir para preservar o histórico." },
      { status: 400 }
    );
  }

  await prisma.satisfactionSurvey.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
